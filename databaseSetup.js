import pg from "pg"

// PostgreSQL connection setup
const db = new pg.Pool({
    // connectionString: "postgres://my_blog_website_user:WRAmhlA7uuwc7n71YIz3mz0imaPD65Cw@dpg-cobasda1hbls73app2og-a.singapore-postgres.render.com/my_blog_website",
    // ssl: {
    //     rejectUnauthorized: false // For self-signed certificates (optional)
    // }
    host: 'localhost',
    port: 5433,
    user: 'postgres',
    password: 'binbin0219',
    database: 'social_media_website',
});
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


