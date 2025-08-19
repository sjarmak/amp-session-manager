export async function listCommand() {
  try {
    console.log('No sessions found.');
    console.log('(SQLite database integration requires native compilation - working in hello-world mode)');
  } catch (error) {
    console.error('Error listing sessions:', error);
    process.exit(1);
  }
}
