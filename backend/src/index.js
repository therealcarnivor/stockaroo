const app = require('./app');
const { startMqttListener } = require('./mqtt');

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`Stockaroo listening on :${PORT}`));
startMqttListener();
