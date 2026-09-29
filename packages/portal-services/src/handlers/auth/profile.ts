// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireSession } from '@cd-v2/api-handlers';
import bcrypt from 'bcryptjs';
import { Client, User, publicUser } from '@web/lib/db';
import {
  ensureClientLocationColumns,
  readClientLocation,
  saveClientLocation,
} from '@web/lib/client-location';
import { normalizeStoredPhone } from '@web/lib/phone-utils';
import { getMissingRrspContactFields, isRrspContactComplete } from '@web/lib/rrsp-contact';
import { getClientRrspAccess } from '@web/lib/rrsp-access';
import { readShowRrspWelcomeOnLogin, mergeShowRrspWelcomeOnLogin } from '@web/lib/rrsp-welcome-prefs';

async function loadLinkedClient(userId: number) {
  await ensureClientLocationColumns();
  return Client.findOne({
    where: { userId },
    attributes: ['id', 'name', 'companyName', 'email', 'phone', 'address', 'contactPerson'],
  });
}

async function serializeLinkedClient(client: {
  id: string;
  name: string;
  companyName?: string | null;
  email: string;
  phone?: string | null;
  address?: string | null;
  contactPerson?: string | null;
} | null) {
  if (!client) return null;
  const location = await readClientLocation(client.id);
  return {
    id: client.id,
    name: client.name,
    companyName: client.companyName ?? null,
    email: client.email ?? '',
    phone: client.phone ?? '',
    address: client.address ?? '',
    contactPerson: client.contactPerson ?? '',
    latitude: location.latitude,
    longitude: location.longitude,
    locationSource: location.locationSource,
  };
}

function parseCoord(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    const user = await User.findByPk(session.id, {
      attributes: { exclude: ['password', 'tempPassword'] },
    });
    if (!user) {
      return { status: 404, body: { success: false, message: 'User not found' } };
    }

    const client = await loadLinkedClient(session.id);
    const rrsp =
      session.role === 'client' ? await getClientRrspAccess(session.id) : null;
    const isShopOwner = Boolean(rrsp?.isShopOwner) || Boolean(client);

    return {
      status: 200,
      body: {
        success: true,
        user: {
          ...publicUser(user),
          phone: user.phone ?? '',
          username: user.username,
        },
        client: await serializeLinkedClient(client),
        rrspNeedsContact: Boolean(rrsp?.needsContact),
        rrspLicensed: Boolean(rrsp?.featureEnabled && rrsp?.licenseActive),
        isShopOwner,
        isShopStaff: Boolean(rrsp?.isShopStaff),
        portalDisplayRole: rrsp?.portalDisplayRole ?? null,
        missingContactFields: rrsp?.missingContactFields ?? [],
        showRrspWelcomeOnLogin: readShowRrspWelcomeOnLogin(user.preferences),
      },
    };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    const body = ctx.body as Record<string, unknown>;
    const user = await User.findByPk(session.id);
    if (!user) {
      return { status: 404, body: { success: false, message: 'User not found' } };
    }

    const firstName = String(body.firstName ?? user.firstName).trim();
    const lastName = String(body.lastName ?? user.lastName).trim();
    const email = String(body.email ?? user.email).trim();
    const phone = normalizeStoredPhone(String(body.phone ?? user.phone ?? '')) ?? null;

    if (body.showRrspWelcomeOnLogin !== undefined) {
      await user.update({
        preferences: mergeShowRrspWelcomeOnLogin(user.preferences, Boolean(body.showRrspWelcomeOnLogin)),
      });
      if (
        body.firstName === undefined &&
        body.lastName === undefined &&
        body.email === undefined &&
        body.phone === undefined &&
        body.client === undefined &&
        body.address === undefined
      ) {
        await user.reload({ attributes: { exclude: ['password', 'tempPassword'] } });
        const rrsp =
          session.role === 'client' ? await getClientRrspAccess(session.id) : null;
        return {
          status: 200,
          body: {
            success: true,
            message: 'Preferences updated',
            user: {
              ...publicUser(user),
              phone: user.phone ?? '',
              username: user.username,
            },
            client: await serializeLinkedClient(await loadLinkedClient(session.id)),
            rrspNeedsContact: Boolean(rrsp?.needsContact),
            rrspLicensed: Boolean(rrsp?.featureEnabled && rrsp?.licenseActive),
            showRrspWelcomeOnLogin: readShowRrspWelcomeOnLogin(user.preferences),
          },
        };
      }
    }

    if (!firstName || !lastName) {
      return { status: 400, body: { success: false, message: 'First and last name are required' } };
    }
    if (!email) {
      return { status: 400, body: { success: false, message: 'Email is required' } };
    }

    const emailClash = await User.findOne({ where: { email } });
    if (emailClash && emailClash.id !== user.id) {
      return { status: 400, body: { success: false, message: 'Email already in use' } };
    }

    await user.update({ firstName, lastName, email, phone });

    let client = await loadLinkedClient(session.id);
    if (client) {
      const clientEmail = String(body.clientEmail ?? body.email ?? client.email).trim();
      const clientPhone =
        normalizeStoredPhone(String(body.clientPhone ?? body.phone ?? client.phone ?? '')) ?? null;
      const clientAddress = String(body.address ?? client.address ?? '').trim() || null;
      const clientName = String(body.clientName ?? client.name).trim() || client.name;
      let latitude = parseCoord(body.latitude);
      let longitude = parseCoord(body.longitude);
      let locationSource =
        body.locationSource === 'pin' || body.locationSource === 'geocode'
          ? body.locationSource
          : null;

      // Also accept nested location object from older clients.
      if (
        (latitude == null || longitude == null) &&
        body.location &&
        typeof body.location === 'object'
      ) {
        const nested = body.location as Record<string, unknown>;
        latitude = parseCoord(nested.latitude) ?? latitude;
        longitude = parseCoord(nested.longitude) ?? longitude;
        if (
          !locationSource &&
          (nested.locationSource === 'pin' || nested.locationSource === 'geocode')
        ) {
          locationSource = nested.locationSource;
        }
      }

      if (latitude != null && (Math.abs(latitude) > 90 || !Number.isFinite(latitude))) {
        return { status: 400, body: { success: false, message: 'Invalid latitude' } };
      }
      if (longitude != null && (Math.abs(longitude) > 180 || !Number.isFinite(longitude))) {
        return { status: 400, body: { success: false, message: 'Invalid longitude' } };
      }
      if ((latitude == null) !== (longitude == null)) {
        return {
          status: 400,
          body: { success: false, message: 'Latitude and longitude must both be set' },
        };
      }
      if (latitude == null || longitude == null) {
        locationSource = null;
      } else if (!locationSource) {
        locationSource = 'pin';
      }

      if (session.role === 'client' && body.requireRrspContact) {
        const missing = getMissingRrspContactFields({
          email: clientEmail,
          phone: clientPhone,
          address: clientAddress,
        });
        if (missing.length) {
          return {
            status: 400,
            body: {
              success: false,
              message: `RRSP requires ${missing.join(', ')}`,
              missingContactFields: missing,
            },
          };
        }
        if (clientAddress && (latitude == null || longitude == null)) {
          return {
            status: 400,
            body: {
              success: false,
              message:
                'Please locate your address on the map, or drop a pin if it cannot be found automatically',
            },
          };
        }
      }

      await client.update({
        name: clientName,
        email: clientEmail || client.email,
        phone: clientPhone,
        address: clientAddress,
      });

      const savedLocation = await saveClientLocation(client.id, {
        latitude,
        longitude,
        locationSource,
      });

      await client.reload();
      client = await loadLinkedClient(session.id);
      const serialized = await serializeLinkedClient(client);
      // Prefer verified SQL read from the write we just did.
      if (serialized) {
        serialized.latitude = savedLocation.verified.latitude;
        serialized.longitude = savedLocation.verified.longitude;
        serialized.locationSource = savedLocation.verified.locationSource;
      }

      await user.reload({ attributes: { exclude: ['password', 'tempPassword'] } });
      const rrsp =
        session.role === 'client' ? await getClientRrspAccess(session.id) : null;

      return {
        status: 200,
        body: {
          success: true,
          message: 'Profile updated',
          user: {
            ...publicUser(user),
            phone: user.phone ?? '',
            username: user.username,
          },
          client: serialized,
          rrspNeedsContact: Boolean(rrsp?.needsContact),
          rrspLicensed: Boolean(rrsp?.featureEnabled && rrsp?.licenseActive),
          contactComplete: client
            ? isRrspContactComplete({
                email: client.email,
                phone: client.phone,
                address: client.address,
              })
            : true,
          showRrspWelcomeOnLogin: readShowRrspWelcomeOnLogin(user.preferences),
        },
      };
    }

    await user.reload({ attributes: { exclude: ['password', 'tempPassword'] } });
    const rrsp =
      session.role === 'client' ? await getClientRrspAccess(session.id) : null;

    return {
      status: 200,
      body: {
        success: true,
        message: 'Profile updated',
        user: {
          ...publicUser(user),
          phone: user.phone ?? '',
          username: user.username,
        },
        client: null,
        rrspNeedsContact: Boolean(rrsp?.needsContact),
        rrspLicensed: Boolean(rrsp?.featureEnabled && rrsp?.licenseActive),
        contactComplete: true,
        showRrspWelcomeOnLogin: readShowRrspWelcomeOnLogin(user.preferences),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update profile';
    return { status: 400, body: { success: false, message } };
  }
}

/** Change own password (current password required). */
export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    const body = ctx.body as Record<string, unknown>;
    const currentPassword = String(body.currentPassword ?? '');
    const newPassword = String(body.newPassword ?? '');

    if (!currentPassword || !newPassword) {
      return {
        status: 400,
        body: { success: false, message: 'Current and new password are required' },
      };
    }
    if (newPassword.length < 8) {
      return {
        status: 400,
        body: { success: false, message: 'New password must be at least 8 characters' },
      };
    }

    const user = await User.findByPk(session.id);
    if (!user) {
      return { status: 404, body: { success: false, message: 'User not found' } };
    }

    const valid = await user.verifyLoginPassword(currentPassword);
    if (!valid) {
      return { status: 400, body: { success: false, message: 'Current password is incorrect' } };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await user.update({
      password: hashedPassword,
      passwordSet: true,
      tempPassword: null,
      isActive: true,
      isLocked: false,
      failedLoginAttempts: 0,
      lockoutUntil: null,
      ...(user.passwordSet ? {} : { firstLoginAt: user.firstLoginAt ?? new Date() }),
    });

    if (user.role === 'client') {
      const client = await Client.findOne({
        where: { userId: session.id },
        attributes: ['id', 'status', 'isActive'],
      });
      if (client && (client.status !== 'active' || !client.isActive)) {
        await client.update({ status: 'active', isActive: true });
      }
    }

    return { status: 200, body: { success: true, message: 'Password updated' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'PUT') return PUTHandler(ctx);
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
