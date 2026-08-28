#!/usr/bin/env node
/**
 * Verify CD → Mini provisioning run (POST + poll) returns PASSED/FAILED + exit code.
 * Usage: node scripts/test-cd-provision-flow.mjs [project_root] [phase]
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const COOKIE_NAME = 'cd_access_token';
const WEB_ORIGIN = (process.env.CD_WEB_ORIGIN || 'http://127.0.0.1:3000').replace(/\/$/, '');
const projectRoot =
  process.argv[2]?.trim()
  || 'E:\\Law Firm System\\repair_workspace\\repair_LawFirm System v2_20251207_114544\\working';
const phase = process.argv[3]?.trim() || 'Readiness';

function jwtSecret() {
  const secret = process.env.JWT_SECRET?.trim() || 'supersecretkey';
  return secret;
}

function adminCookie() {
  const token = jwt.sign({ id: 1, role: 'admin' }, jwtSecret(), { expiresIn: '1h' });
  return `${COOKIE_NAME}=${encodeURIComponent(token)}`;
}

async function main() {
  const cookie = adminCookie();
  const postRes = await fetch(`${WEB_ORIGIN}/api/developer-toolbox/provisioning`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      action: 'run',
      client_poll: true,
      project_root: projectRoot,
      phase,
      customer_name: '',
      package_path: '',
      version: '',
      allow_warnings: false,
      skip_readiness: false,
    }),
  });
  const postBody = await postRes.json();
  console.log('POST', postRes.status, JSON.stringify(postBody).slice(0, 500));

  if (postBody.exit_code !== undefined && postBody.audit_result) {
    console.log('OK (sync)', postBody.audit_result, 'exit', postBody.exit_code);
    return;
  }

  const jobId = String(postBody.job_id || '').trim();
  if (!jobId) {
    console.error('FAIL: no job_id and no final result');
    process.exit(1);
  }

  for (let i = 0; i < 80; i += 1) {
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await fetch(
      `${WEB_ORIGIN}/api/developer-toolbox/provisioning?job_id=${encodeURIComponent(jobId)}`,
      { headers: { Cookie: cookie } },
    );
    const pollBody = await pollRes.json();
    const status = String(pollBody.status || '');
    const label = pollBody.audit_result || pollBody.result || '';
    console.log('POLL', i, status, label, pollBody.exit_code ?? '');
    if (status === 'completed' || status === 'failed') {
      if (label && pollBody.exit_code !== undefined) {
        console.log('OK', label, 'exit', pollBody.exit_code);
        return;
      }
      console.error('FAIL: completed without result/exit_code', JSON.stringify(pollBody).slice(0, 400));
      process.exit(1);
    }
  }
  console.error('FAIL: timed out waiting for Mini audit');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
