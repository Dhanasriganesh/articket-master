const admin = require('firebase-admin');

// Use the correct path to your Firebase service account key (same directory)
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixUserProjects() {
  // Build a map of projectId -> projectName
  const projectsSnapshot = await db.collection('projects').get();
  const projectIdToName = {};
  projectsSnapshot.forEach(doc => {
    projectIdToName[doc.id] = doc.data().name;
  });

  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();
  let updated = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    let projectNames = [];

    // If user has a 'projects' array, map IDs to names
    if (Array.isArray(data.projects)) {
      projectNames = data.projects.map(pid => projectIdToName[pid]).filter(Boolean);
    }

    // If user has a 'project' string or array, merge it in
    if (typeof data.project === 'string') {
      if (!projectNames.includes(data.project)) projectNames.push(data.project);
    } else if (Array.isArray(data.project)) {
      for (const name of data.project) {
        if (!projectNames.includes(name)) projectNames.push(name);
      }
    }

    // Only update if needed
    if (projectNames.length && (JSON.stringify(data.project) !== JSON.stringify(projectNames))) {
      await doc.ref.update({ project: projectNames });
      updated++;
      console.log(`Updated user ${doc.id}: project -> ${JSON.stringify(projectNames)}`);
    }
  }

  console.log(`Migration complete. Updated ${updated} user(s).`);
}

fixUserProjects().catch(console.error);