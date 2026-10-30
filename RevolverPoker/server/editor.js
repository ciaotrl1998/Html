import { createPokerServer } from './index.js';

const app = createPokerServer();
const port = Number(process.env.EDITOR_PORT || 3090);
app.server.listen(port, '127.0.0.1', () => console.log(`场景编辑器：http://127.0.0.1:${port}/editor`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
