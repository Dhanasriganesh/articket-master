import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
 
export const fetchProjectMemberEmails = async (projectName) => {
  if (!projectName) return [];
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('project', '==', projectName));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data().email).filter(Boolean);
  } catch (error) {
    console.error("Error fetching project member emails:", error);
    return [];
  }
};
 
 