import pg from "pg"
import { clearAllRecords, saveUser } from "./algoliasearch.js";
import fs from "fs";
import { AlgoliaUserIndexName, isUsingRenderHostDatabase, userAvatarDirPath, userAvatarFormat } from "./config.js";
import { generateRandomAvatar } from "./index.js";
import sharp from "sharp";
import 'dotenv/config'

// PostgreSQL connection setup
let db;
if(isUsingRenderHostDatabase) {
    db = new pg.Pool({
      connectionString: 'postgresql://jiungbin0219:cvQ1hjKMNfS1uTaUWDyTgQiFzw1bVUlT@dpg-cu83n69opnds73ep9hag-a.oregon-postgres.render.com/blogify_7s4j',
      ssl: {
          rejectUnauthorized: false // For self-signed certificates (optional)
      }
  });
} else {
  db = new pg.Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
}

const createTableQueries = [
  `CREATE TABLE IF NOT EXISTS "public"."users" (
    "user_id" SERIAL PRIMARY KEY,
    "account_name" VARCHAR(50),
    "gender" VARCHAR(20),
    "username" VARCHAR(50),
    "first_name" VARCHAR(50),
    "last_name" VARCHAR(50),
    "password" VARCHAR(200),
    "occupation" VARCHAR(50),
    "relationship_status" VARCHAR(50),
    "country" VARCHAR(50),
    "region" VARCHAR(50),
    "phone_number" JSONB,
    "create_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "public"."posts" (
    "user_id" INTEGER,
    "post_id" SERIAL PRIMARY KEY,
    "title" TEXT,
    "content" TEXT,
    "date" VARCHAR(50),
    "username" VARCHAR(100),
    "create_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE CASCADE
  );`,

  `CREATE TABLE IF NOT EXISTS "public"."comments" (
    "comment_id" SERIAL PRIMARY KEY,
    "post_id" INTEGER,
    "user_id" INTEGER,
    "username" VARCHAR(200),
    "content" TEXT,
    "create_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("post_id") REFERENCES "posts" ("post_id") ON DELETE CASCADE,
    FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE CASCADE
  );`,

  `CREATE TABLE IF NOT EXISTS "public"."likes" (
    "like_id" SERIAL PRIMARY KEY,
    "user_id" INTEGER,
    "post_id" INTEGER,
    "create_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE CASCADE,
    FOREIGN KEY ("post_id") REFERENCES "posts" ("post_id") ON DELETE CASCADE
  );`,

  `CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "notification_id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "sender_id" INTEGER,
    "type" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "link" TEXT,
    "seen" BOOLEAN DEFAULT false,
    "create_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE CASCADE,
    FOREIGN KEY ("sender_id") REFERENCES "users" ("user_id") ON DELETE CASCADE
  );
  `,
  `CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "friendship_id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "friend_id" INTEGER NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "status" VARCHAR(100) NOT NULL CHECK ("status" IN ('pending', 'accepted', 'rejected')),
    "create_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE CASCADE,
    FOREIGN KEY ("friend_id") REFERENCES "users" ("user_id") ON DELETE CASCADE
  )`
];

export default async function databaseSetup() {
    let client;
  try {
    // Connect to the database
    client = await db.connect();
    console.log('Connected to the database.');

    // Loop through and execute each table creation query
    for (let query of createTableQueries) {
      await client.query(query);
    }

  } catch (err) {
    console.error('Error during migration:', err.stack);
  } finally {
    // Close the connection after migration
    await client.release();
    console.log('Connection closed.');
    return client;
  }
}

export async function runQuery(queryText, values) {
    const client = await db.connect(); // Get a client from the pool
    try {
        const res = values != undefined ? await client.query(queryText, values) : await client.query(queryText); // Run the query
        return res.rows; // Return the result
    } catch (err) {
        console.error('Error executing query:', err);
        throw err; // Rethrow the error if necessary
    } finally {
        client.release(); // Release the client back to the pool
    }
}

export async function dropAllTables() {
    return await runQuery("DROP TABLE IF EXISTS notifications, friendships, comments, likes, posts, users;");
}

export async function checkIfAllTablesExist() {
  const tables = ['users', 'posts', 'likes', 'comments', 'notifications', 'friendships'];
  const query = `
      SELECT COUNT(*) AS table_count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[]);
  `;
  
  const result = await runQuery(query, [tables]);
  return result[0].table_count == tables.length;
}


export async function insertSampleData() {
  try {
    const client = await db.connect(); // Get a client from the pool
    // Insert sample data into the tables
    await client.query(`INSERT INTO users
      (user_id, account_name, gender, username, first_name, last_name, password, occupation, relationship_status, country, region, phone_number)
      VALUES
      (1,'Tjiungbin0219', 'Male', 'Tjiungbin0219', 'Teo', 'Jiung Bin', 'randompassword', 'Web Developer', 'It''s Complicated', 'Malaysia', 'Johor', '{
        "dialCode": "60",
        "fullNumber": "+6010-795 7070",
        "countryISO2": "my",
        "countryName": "Malaysia",
        "phoneNumberBody": "10-795 7070"
      }'),
      (2,'MeiLin1234', 'Female', 'MeiLin1234', 'Mei', 'Lin', 'randompassword', 'Teacher', 'Single', NULL, NULL, NULL)
      ON CONFLICT (user_id) DO NOTHING
    `);

    // Avatar
    // Ensure the directory exists
    if (!fs.existsSync(userAvatarDirPath)) {
      fs.mkdirSync(userAvatarDirPath, { recursive: true });
    }
    // Generate a random avatar and save it 1
    const userAvatar1 = await generateRandomAvatar(('male'));
    sharp(Buffer.from(userAvatar1))
    // .png({ quality: 90, compressionLevel: 9, force: true })  // force PNG format and set transparency
    .toFormat(`${userAvatarFormat}`)
    .toFile(userAvatarDirPath + `/user_avatar_1.${userAvatarFormat}`);
    // Generate a random avatar and save it 2
    const userAvatar2 = await generateRandomAvatar(('female'));
    sharp(Buffer.from(userAvatar2))
    // .png({ quality: 90, compressionLevel: 9, force: true })  // force PNG format and set transparency
    .toFormat(`${userAvatarFormat}`)
    .toFile(userAvatarDirPath + `/user_avatar_2.${userAvatarFormat}`);

    // Algolia
    await clearAllRecords(AlgoliaUserIndexName);
    saveUser({ objectID: 1, user_id: 1, username: 'Tjiungbin0219' });
    saveUser({ objectID: 2, user_id: 2, username: 'MeiLin1234' });

    await client.query(`INSERT INTO posts
      (user_id, post_id, title, content, date, username)
      VALUES
      (1, 1, 'Welcome to Blogify! 😊', 'You can set up your profile details so that other users can know you better!\n
      You can do it by hovering your profile picture in the navbar and go for the setting.', '2024-12-15 7:30', 'Tjiungbin0219'),
      (2, 2, 'How long do dogs live on average?', 'Nearly 40% of small breed dogs live longer than 10 years, but only 13% of giant breed dogs live that long. The average 50-pound dog will live 10 to 12 years. But giant breeds such as great Danes or deerhounds are elderly at 6 to 8 years.', '2024-12-21 5:30', 'MeiLin1234')
      ON CONFLICT (post_id) DO NOTHING
    `);

    await client.query(`INSERT INTO comments
      (comment_id, post_id, user_id, username, content)
      VALUES
      (2, 1, 2, 'MeiLin1234', 'Hi!'),
      (1, 1, 1, 'Tjiungbin0219', 'Hello!')
      ON CONFLICT (comment_id) DO NOTHING
    `);

    await client.query(`INSERT INTO likes
      (like_id, user_id, post_id)
      VALUES
      (1, 1, 1),
      (2, 2, 1)
      ON CONFLICT (like_id) DO NOTHING
    `);

    client.release(); // Release the client back to the pool
    console.log('Sample data inserted.');
  } catch (err) {
    console.error('Error inserting sample data:', err);
  }
    
}


