export async function register() {
  // Only start scheduler during runtime, not during build
  if (process.env.NEXT_RUNTIME === 'nodejs' && !process.env.npm_lifecycle_event?.includes('build')) {
    try {
      const { installClientDisconnectGuards } = await import('@/lib/client-disconnect-guards');
      installClientDisconnectGuards();
    } catch (error) {
      console.error('Failed to install client disconnect guards:', error);
    }
    try {
      const { startOrderEmailMonitoringScheduler } = await import('@/lib/order-email-monitoring-scheduler');
      startOrderEmailMonitoringScheduler();
    } catch (error) {
      console.error('Failed to start order email monitoring scheduler:', error);
    }
    try {
      const { startDeveloperToolboxHealthScheduler } = await import('@/lib/developer-toolbox/health-scheduler');
      startDeveloperToolboxHealthScheduler();
    } catch (error) {
      console.error('Failed to start developer toolbox health scheduler:', error);
    }
  }
}
