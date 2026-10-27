export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startupChecks } = await import("./instrumentation-node");
    startupChecks();
  }
}
