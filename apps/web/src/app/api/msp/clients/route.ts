import { NextRequest, NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { Client } from '@/lib/db';
import { serializeClient } from '@/lib/clients';
import { mspAuthErrorResponse, requireMspApiAuth } from '@/lib/msp-auth';
import { SERVICE_LEVELS } from '@/lib/client-constants';

/** Used by license activation GUI / Python msp_integration.py */
export async function GET(req: NextRequest) {
  try {
    requireMspApiAuth(req);

    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get('page') ?? 1));
    const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? 100)));
    const serviceLevel = searchParams.get('serviceLevel');
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = {
      serviceLevel: { [Op.in]: [...SERVICE_LEVELS] },
    };
    if (serviceLevel) where.serviceLevel = serviceLevel;

    const { rows, count } = await Client.findAndCountAll({
      where,
      limit,
      offset,
      order: [['created_at', 'DESC']],
    });

    return NextResponse.json({
      success: true,
      clients: rows.map(serializeClient),
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    return mspAuthErrorResponse(error);
  }
}
