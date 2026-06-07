import { NextRequest, NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { Client, Ticket } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import {
  buildDefaultUsageTracking,
  buildUsageInfo,
  createPortalUserForClient,
  forceDeleteClient,
  getClientById,
  mergeUsageLimitsForServiceLevel,
  resolveUniqueEmail,
  sendPortalWelcomeEmail,
  serializeClient,
  validateTechnicianAssignment,
} from '@/lib/clients';
import { getDefaultMonthlyRate, getDefaultSlaForLevel } from '@/lib/client-constants';
import { pickClientFields } from '@/lib/client-payload';
import { buildPortalUrl, getRequestPublicOrigin } from '@/lib/site-url';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { searchParams } = req.nextUrl;
    const status = searchParams.get('status');
    const serviceLevel = searchParams.get('serviceLevel');
    const search = searchParams.get('search')?.trim();

    const where: Record<string, unknown> = {};
    if (status && status !== 'all') where.status = status;
    if (serviceLevel && serviceLevel !== 'all') {
      where.serviceLevel = serviceLevel === 'none' ? null : serviceLevel;
    }
    if (search) {
      Object.assign(where, {
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { companyName: { [Op.like]: `%${search}%` } },
          { contactPerson: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
          { phone: { [Op.like]: `%${search}%` } },
        ],
      });
    }

    const clients = await Client.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 500,
    });

    return NextResponse.json({
      success: true,
      clients: clients.map(serializeClient),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const body = await req.json();
    const name = body.name?.trim();
    const email = body.email?.trim();

    if (!name || !email) {
      return NextResponse.json({ success: false, message: 'Name and email are required' }, { status: 400 });
    }

    if (!(await resolveUniqueEmail(email))) {
      return NextResponse.json({ success: false, message: 'A client with this email already exists' }, { status: 400 });
    }

    const serviceLevel = body.serviceLevel || null;
    const createPortalAccount = Boolean(body.createPortalAccount);
    let assignedTechnicianId: string | null = null;
    if (body.assignedTechnicianId) {
      assignedTechnicianId = await validateTechnicianAssignment(body.assignedTechnicianId);
    }

    let userId: number | undefined;
    let portalCredentials: { username: string; tempPassword: string; emailSent: boolean } | undefined;
    if (createPortalAccount) {
      const { user, tempPassword, username } = await createPortalUserForClient({
        email,
        name,
        contactPerson: body.contactPerson,
        phone: body.phone,
      });
      userId = user.id;
      const portalUrl = await buildPortalUrl(getRequestPublicOrigin(req));
      const emailSent =
        body.sendWelcomeEmail === true
          ? await sendPortalWelcomeEmail(
              { email, contactPerson: body.contactPerson },
              username,
              tempPassword,
              portalUrl
            )
          : false;
      portalCredentials = { username, tempPassword, emailSent };
    }

    const client = await Client.create({
      name,
      email,
      ...pickClientFields(body),
      assignedTechnicianId,
      serviceLevel: serviceLevel || null,
      supportTier: (body.supportTier as Client['supportTier']) || 'silver',
      status: (createPortalAccount ? 'pending' : body.status || 'active') as Client['status'],
      isActive: createPortalAccount ? false : body.isActive !== false,
      monthlyRate:
        body.monthlyRate != null && body.monthlyRate !== ''
          ? Number(body.monthlyRate)
          : getDefaultMonthlyRate(serviceLevel) ?? 0,
      usageTracking: body.usageTracking || buildDefaultUsageTracking(serviceLevel),
      billingInfo: body.billingInfo || {},
      contractDetails: body.contractDetails || {},
      servicePlanData: body.servicePlanData || {},
      slaAgreement: body.slaAgreement || (serviceLevel ? getDefaultSlaForLevel(serviceLevel) : {}),
      features: body.features || [],
      communicationHistory: [],
      userId,
    });

    const full = await Client.findByPk(client.id);
    return NextResponse.json(
      {
        success: true,
        client: serializeClient(full ?? client),
        portalCredentials,
        message: 'Client created',
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid technician assignment') {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}
