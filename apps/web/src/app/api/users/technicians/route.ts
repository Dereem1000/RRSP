import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { User } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const session = requireSession(req as import('next/server').NextRequest);
    requireRole(session, 'admin', 'technician');

    const technicians = await User.findAll({
      where: {
        isActive: true,
        role: { [Op.in]: ['admin', 'technician'] },
      },
      attributes: ['id', 'username', 'firstName', 'lastName', 'role'],
      order: [['firstName', 'ASC']],
    });

    return NextResponse.json({ success: true, technicians });
  } catch (error) {
    return authErrorResponse(error);
  }
}
