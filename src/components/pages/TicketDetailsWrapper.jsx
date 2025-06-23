import React from 'react';
import { useParams } from 'react-router-dom';
import TicketDetails from './TicketDetails';
 
const TicketDetailsWrapper = () => {
  const { ticketId } = useParams();
  return <TicketDetails ticketId={ticketId} />;
};
 
export default TicketDetailsWrapper;
 