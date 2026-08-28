#!/usr/bin/env node

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

let findingCounter = 0;

/**
 * Collects audit findings and check metadata for the final report.
 */
export class AuditContext {
  constructor(root, options = {}) {
    this.root = root;
    this.options = {
      environment: options.environment ?? 'production',
      baseUrl: options.baseUrl ?? '',
      skipLive: options.skipLive ?? false,
      skipDeps: options.skipDeps ?? false,
      strict: options.strict ?? false,
    };
    this.findings = [];
    this.checks = [];
    this.startedAt = new Date().toISOString();
  }

  recordCheck(id, name, status, detail = '') {
    this.checks.push({
      id,
      name,
      status,
      detail,
      at: new Date().toISOString(),
    });
  }

  finding({
    severity = 'medium',
    category,
    title,
    description,
    remediation,
    evidence = null,
    checkId,
  }) {
    findingCounter += 1;
    const item = {
      id: `FIND-${String(findingCounter).padStart(4, '0')}`,
      severity,
      category,
      title,
      description,
      remediation,
      evidence,
      checkId,
      status: 'open',
    };
    this.findings.push(item);
    return item;
  }

  summary() {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 };
    for (const f of this.findings) {
      if (counts[f.severity] !== undefined) counts[f.severity] += 1;
      counts.total += 1;
    }

    let score = 100;
    score -= counts.critical * 25;
    score -= counts.high * 12;
    score -= counts.medium * 5;
    score -= counts.low * 2;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const passed = this.checks.filter((c) => c.status === 'passed').length;
    const failed = this.checks.filter((c) => c.status === 'failed').length;
    const skipped = this.checks.filter((c) => c.status === 'skipped').length;

    return {
      ...counts,
      score,
      checksRun: this.checks.length,
      checksPassed: passed,
      checksFailed: failed,
      checksSkipped: skipped,
    };
  }

  overallStatus() {
    const s = this.summary();
    if (s.critical > 0) return 'critical';
    if (s.high > 0) return 'high_risk';
    if (s.medium > 0) return 'medium_risk';
    if (s.low > 0) return 'low_risk';
    return 'pass';
  }

  exitCode() {
    const s = this.summary();
    if (this.options.strict && s.total > 0) return 1;
    if (s.critical > 0 || s.high > 0) return 1;
    return 0;
  }

  severityRank(severity) {
    const idx = SEVERITY_ORDER.indexOf(severity);
    return idx === -1 ? 99 : idx;
  }

  sortedFindings() {
    return [...this.findings].sort(
      (a, b) => this.severityRank(a.severity) - this.severityRank(b.severity)
    );
  }
}
