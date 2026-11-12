import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { emptyProfile } from '../src/data/mockData.js';
import { mongoGoogleStore } from './googleStore.js';
import { createMongoEmbeddingCache } from './services/embeddingCache.js';

export async function connectMongoStore(uri = process.env.MONGODB_URI, databaseName = process.env.DB_NAME || 'jobswipe') {
  if (!uri) throw new Error('MONGODB_URI must be configured to use persistent MongoDB storage.');
  const client = new MongoClient(uri);
  try { await client.connect(); }
  catch (error) { await client.close(); throw error; }
  const db = client.db(databaseName);
  const users = db.collection('users');
  const applications = db.collection('applications');
  const savedJobs = db.collection('saved_jobs');
  const sessions = db.collection('sessions');
  const drafts = db.collection('resume_drafts');
  const resumes = db.collection('resumes');

  try {
    await Promise.all([
      users.createIndex({ email: 1 }, { unique: true }),
      applications.createIndex({ user_id: 1, job_id: 1 }, { unique: true }),
      savedJobs.createIndex({ user_id: 1, job_id: 1 }, { unique: true }),
      sessions.createIndex({ token_hash: 1 }, { unique: true }),
      sessions.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
      drafts.createIndex({ user_id: 1 }, { unique: true }),
      resumes.createIndex({ user_id: 1 }, { unique: true }),
    ]);
  } catch (error) {
    await client.close();
    throw error;
  }

  const mapUser = document => document ? { ...document, id: document._id } : undefined;
  let google, embeddingCache;
  try {
    google = await mongoGoogleStore(db, client, mapUser);
    embeddingCache = await createMongoEmbeddingCache(db);
  }
  catch (error) { await client.close(); throw error; }
  return {
    ...google,
    embeddingCache,
    close: () => client.close(),
    async applications(id) {
      const rows = await applications.find({ user_id: id }).sort({ started_at: -1 }).toArray();
      return rows.map(row => ({ ...row.job_json, id: row.job_id, status: row.status, startedAt: row.started_at, updatedAt: row.updated_at }));
    },
    async recruiterApplications(companyName) {
      const rows = await applications.aggregate([
        { $lookup: { from: 'users', localField: 'user_id', foreignField: '_id', as: 'applicantUser' } },
        { $unwind: '$applicantUser' },
        { $sort: { started_at: -1 } },
      ]).toArray();
      return rows.filter(row => row.job_json?.company?.trim().toLowerCase() === companyName.toLowerCase()).map(row => {
        const profile = JSON.parse(row.applicantUser.profile_json);
        return { ...row.job_json, id: row.job_id, status: row.status, startedAt: row.started_at, updatedAt: row.updated_at,
          applicantId: String(row.user_id), applicant: { name: profile.name, email: row.applicantUser.email, phone: profile.phone,
            skills: profile.skills, education: profile.education, experience: profile.experience, resumeName: profile.resumeName || '' } };
      });
    },
    async recruiterForCompany(companyName) {
      if (!companyName) return undefined;
      const usersForCompany = await users.find({ role: 'Recruiter' }).toArray();
      const match = usersForCompany.map(user => JSON.parse(user.profile_json))
        .find(profile => profile.companyName?.trim().toLowerCase() === companyName.trim().toLowerCase());
      return match && { name: match.name, title: match.title, profileImage: match.profileImage,
        companyLogo: match.companyLogo, companyDescription: match.companyDescription, companyWebsite: match.companyWebsite };
    },
    async updateRecruiterApplication(companyName, applicantId, jobId, status) {
      const row = await applications.findOne({ user_id: applicantId, job_id: jobId });
      if (!row || row.job_json?.company?.trim().toLowerCase() !== companyName.toLowerCase()) return 0;
      return (await applications.updateOne({ user_id: applicantId, job_id: jobId }, { $set: { status, updated_at: new Date().toISOString() } })).matchedCount;
    },
    async recruiterResume(companyName, applicantId, jobId) {
      const application = await applications.findOne({ user_id: applicantId, job_id: jobId });
      if (!application || application.job_json?.company?.trim().toLowerCase() !== companyName?.toLowerCase()) return null;
      const row = await resumes.findOne({ user_id: applicantId });
      if (!row) return null;
      const buffer = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data.value(true));
      return { name: row.original_name, contentType: row.content_type, buffer };
    },
    async savedJobs(id) {
      const rows = await savedJobs.find({ user_id: id }).sort({ saved_at: -1 }).toArray();
      return rows.map(row => row.job_json);
    },
    async saveJob(id, job) {
      await savedJobs.updateOne(
        { user_id: id, job_id: String(job.id) },
        { $set: { job_json: job }, $setOnInsert: { saved_at: new Date().toISOString() } },
        { upsert: true },
      );
    },
    async removeSavedJob(id, jobId) {
      return (await savedJobs.deleteOne({ user_id: id, job_id: jobId })).deletedCount;
    },
    async startApplication(id, job) {
      const date = new Date().toISOString();
      await applications.updateOne(
        { user_id: id, job_id: String(job.id) },
        { $setOnInsert: { job_json: job, status: 'Started', started_at: date, updated_at: date } },
        { upsert: true },
      );
    },
    async updateApplication(id, jobId, status) {
      return (await applications.updateOne(
        { user_id: id, job_id: jobId },
        { $set: { status, updated_at: new Date().toISOString() } },
      )).matchedCount;
    },


    async deleteApplication(id, jobId) {
      const result = await applications.deleteOne({
        user_id: id,
        job_id: jobId
      });

    return result.deletedCount;
    },


    findUser: async email => mapUser(await users.findOne({ email })),
    async createUser(email, passwordHash, name, role) {
      const profile = { ...emptyProfile, name, email };
      const id = randomUUID();
      try {
        await users.insertOne({ _id: id, email, password_hash: passwordHash, role,
          profile_json: JSON.stringify(profile), confirmed: 0 });
        return id;
      } catch (error) {
        if (error.code === 11000) return null;
        throw error;
      }
    },
    user: async id => mapUser(await users.findOne({ _id: id })),
    async saveProfile(id, profile) {
      await users.updateOne({ _id: id }, { $set: { profile_json: JSON.stringify(profile), confirmed: 1 } });
    },
    async saveDraft(id, result) {
      await drafts.updateOne({ user_id: id }, { $set: { result_json: JSON.stringify(result) } }, { upsert: true });
    },
    async draft(id) {
      const row = await drafts.findOne({ user_id: id });
      return row ? JSON.parse(row.result_json) : null;
    },
    async deleteDraft(id) { await drafts.deleteOne({ user_id: id }); },
    async saveResume(id, resume) {
      await resumes.updateOne(
        { user_id: id },
        { $set: { original_name: resume.originalname, content_type: resume.mimetype, data: resume.buffer, saved_at: new Date().toISOString() } },
        { upsert: true },
      );
    },
    async resume(id) {
      const row = await resumes.findOne({ user_id: id });
      const buffer = row && (Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data.value(true)));
      return row ? { name: row.original_name, contentType: row.content_type, buffer, savedAt: row.saved_at } : null;
    },
    async deleteResume(id) {
      await resumes.deleteOne({ user_id: id });
      const user = await users.findOne({ _id: id }, { projection: { profile_json: 1 } });
      if (user) {
        const profile = JSON.parse(user.profile_json);
        await users.updateOne({ _id: id }, { $set: { profile_json: JSON.stringify({ ...profile, resumeName: '' }) } });
      }
    },
    async deleteAccount(id) {
      await Promise.all([
        applications.deleteMany({ user_id: id }),
        savedJobs.deleteMany({ user_id: id }),
        sessions.deleteMany({ user_id: id }),
        drafts.deleteMany({ user_id: id }),
        resumes.deleteMany({ user_id: id }),
        embeddingCache.deleteForUser(String(id)),
        users.deleteOne({ _id: id }),
      ]);
    },
    async addSession(hash, id, expires) {
      await sessions.deleteMany({ expires_at: { $lte: new Date() } });
      await sessions.insertOne({ token_hash: hash, user_id: id, expires_at: new Date(expires) });
    },
    async sessionUser(hash) {
      return mapUser(await sessions.aggregate([
        { $match: { token_hash: hash, expires_at: { $gt: new Date() } } },
        { $lookup: { from: 'users', localField: 'user_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $replaceWith: '$user' },
        { $limit: 1 },
      ]).next());
    },
    async deleteSession(hash) { await sessions.deleteOne({ token_hash: hash }); },
  };
}

export function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role,
    profile: JSON.parse(user.profile_json), confirmed: Boolean(user.confirmed) };
}
