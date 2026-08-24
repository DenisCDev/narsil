const ROWS = Array.from({ length: 50 }, (_, i) => ({
  id: String(i + 1),
  name: `User ${i + 1}`,
  email: `user${i + 1}@bench.local`,
}));

export async function listUsers() {
  return ROWS;
}
