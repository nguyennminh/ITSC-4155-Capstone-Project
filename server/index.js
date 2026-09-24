import 'dotenv/config';
import { createApp } from './app.js';

// Local development only until the team adds authentication and persistent storage.
const port = Number(process.env.PORT || 3001);
createApp().listen(port, '127.0.0.1', () => {
  console.log(`JobSwipe API ready at http://127.0.0.1:${port}`);
});
