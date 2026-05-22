const express = require('express');
const axios = require('axios');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.urlencoded({ extended: false }));

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getSmartsheetData() {
  const response = await axios.get(
    `https://api.smartsheet.com/2.0/sheets/${process.env.SMARTSHEET_SHEET_ID}`,
    { headers: { Authorization: `Bearer ${process.env.SMARTSHEET_TOKEN}` } }
  );

  const sheet = response.data;
  const columns = sheet.columns.map(c => c.title);

  const rows = sheet.rows.map(row => {
    const cells = row.cells.map((cell, i) => `${columns[i]}: ${cell.displayValue || cell.value || ''}`);
    return cells.join(' | ');
  });

  return rows.join('\n');
}

app.post('/sms', async (req, res) => {
  const incomingMessage = req.body.Body;
  const fromNumber = req.body.From;

  try {
    const projectData = await getSmartsheetData();

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `You are a helpful assistant for our project team. 
Here is our current project data from Smartsheet:

${projectData}

A team member just texted this question: "${incomingMessage}"

Answer their question using only the data above. 
Be concise (this is a text message). If you can't find the answer, say so.`
      }]
    });

    const answer = aiResponse.content[0].text;

    await twilioClient.messages.create({
      body: answer,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: fromNumber
    });

    res.status(200).send('OK');

  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error');
  }
});

app.listen(8080, () => console.log('Server running on port 8080'));
