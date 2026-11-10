'use strict';

const config = require('./config/env');
const { createApp } = require('./app');

const app = createApp();
app.listen(config.port, () => {
  console.log(`DesignMatch running at http://localhost:${config.port}`);
});
