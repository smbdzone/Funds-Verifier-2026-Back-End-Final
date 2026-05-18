// const express = require('express');
// const nodemailer = require('nodemailer');
// const bodyParser = require('body-parser');
// const cors = require('cors');

// const app = express();
// const port = 4000;

// // Middleware
// app.use(cors());
// app.use(bodyParser.json());

// // Nodemailer configuration
// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: 'surakshakumari.bcsf18@iba-suk.edu.pk', // Replace with your email
//     pass: 'grjb loyk yxgs szcq'   // Replace with your email password
//   }
// });

// // API route to handle form submission
// app.post('/submit', async (req, res) => {
//   const formData = req.body;

//   const mailOptions = {
//     from: 'surakshakumari.bcsf18@iba-suk.edu.pk',  // Replace with your email
//     to: 'surakshak571@gmail.com',
//     subject: 'New Property Listing Submission',
//     text: JSON.stringify(formData, null, 2)
//   };

//   try {
//     await transporter.sendMail(mailOptions);
//     res.status(200).send('Email sent successfully');
//   } catch (error) {
//     console.error('Error sending email:', error);
//     res.status(500).send('Error sending email');
//   }
// });

// app.listen(port, () => {
// //   console.log(`Server running at http://localhost:${port}`);
// });
