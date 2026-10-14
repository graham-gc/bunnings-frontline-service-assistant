const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api/customers', require('./routes/customers'));
app.use('/api/products', require('./routes/products'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/quotations', require('./routes/quotations'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/check', require('./routes/check'));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Bunnings Frontline Service Assistant'
  });
});

app.listen(PORT, () => {
  console.log(`Bunnings Frontline Service Assistant listening on http://localhost:${PORT}`);
});
