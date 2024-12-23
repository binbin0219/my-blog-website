import { algoliasearch } from 'algoliasearch';
import { runQuery } from './databaseSetup.js';

function algoliasearchInit() {
    const client = algoliasearch('EMUUEQI5C4', 'b2d7e6032e4077afa3e9dffb944fd000');

    // Fetch and index objects in Algolia
    const processRecords = async () => {
        const posts = await runQuery("SELECT * FROM posts");
        return await client.saveObjects({ indexName: 'posts_index', objects: posts });
    };
    
    processRecords()
    .then(() => console.log('Successfully indexed objects!'))
    .catch((err) => console.error(err));
}

function saveUser(user) {
    const client = algoliasearch('EMUUEQI5C4', 'b2d7e6032e4077afa3e9dffb944fd000');
    return client.saveObjects({ indexName: 'users_index', objects: [user] });
}

export { algoliasearchInit, saveUser }