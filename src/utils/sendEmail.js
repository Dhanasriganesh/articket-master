import emailjs from 'emailjs-com';
 
/**
 * Sends an email using EmailJS
 * @param {Object} params - The template parameters for EmailJS
 * @returns {Promise}
 *
 * Recommended EmailJS subject template:
 *   [{{project}}] Ticket #{{request_id}} - {{subject}} ({{status}})
 */
export const sendEmail = async (params) => {
  const SERVICE_ID = 'service_f257b23';
  const TEMPLATE_ID = 'template_rorcfae';
  const PUBLIC_KEY = 'ra7gO6IdJA5dC3cH4';
 
  // Example of how to build the params object for EmailJS
  // (Fill these fields when calling sendEmail)
  // const emailParams = {
  //   to_email: 'recipient1@example.com,recipient2@example.com',
  //   from_name: 'Articket Support',
  //   reply_to: 'support@yourdomain.com',
  //   subject: ticketSubject, // optional, if your template uses it
  //   request_id: ticketId,
  //   status: ticketStatus,
  //   priority: ticketPriority,
  //   category: ticketCategory,
  //   project: ticketProject,
  //   assigned_to: assignedTo,
  //   created: createdDate,
  //   requester: `${requesterName} (${requesterEmail})`,
  //   description: ticketDescription,
  //   comment: commentText, // Only for comment notification
  //   ticket_link: `https://your-app-domain/tickets/${ticketId}`,
  // };
 
  try {
    await emailjs.send(SERVICE_ID, TEMPLATE_ID, params, PUBLIC_KEY);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
};
 