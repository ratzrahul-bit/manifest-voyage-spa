exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY
  const { to, toName, subject, html } = JSON.parse(event.body)

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: 'IGM Nepal', email: 'rathirahulraj@gmail.com' },
      to: [{ email: to, name: toName }],
      subject,
      htmlContent: html,
    }),
  })

  const data = await response.json()
  return {
    statusCode: response.ok ? 200 : 400,
    body: JSON.stringify(data),
  }
}
