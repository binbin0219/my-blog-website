import express from "express"
import bodyParser from "body-parser"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import cookieParser from "cookie-parser"
import databaseSetup, { runQuery } from "./databaseSetup.js"

const app = express();
const port = process.env.PORT || 4000;
const jwtSecret = '1283fc47b7cd439a7f8e36e614a41fe519be35088befd42bc2fdf7130a646e9a75685b';
var user = [];
var posts = [];
var likes = [];
var comments = [];

const db = await databaseSetup();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.use(cookieParser());

app.get('/login', async (req, res) => {
    res.render("login.ejs");
});

app.get('/sign-up', async (req, res) => {
    res.render("sign-up-page.ejs");
})


// Initial_Page
app.get('/', async (req, res) => {  
    console.log("A user visited " + req.url + "at " + new Date().toISOString + " from " + req.ip + " using " + req.headers['user-agent'] + " hostname: " + req.hostname);
    const token = req.cookies.jwt;
    
    if(token){
        jwt.verify(token, jwtSecret, async (err, decodedToken)=> {
            (err)
            ?
            res.status(401).json({message: "user not authorized!"})
            :
            user = await runQuery("SELECT * FROM users WHERE user_id = $1", [decodedToken.userid]);
            posts = await runQuery("SELECT * FROM posts ORDER BY post_id DESC");
            likes = await runQuery("SELECT * FROM likes");
            comments = await runQuery("SELECT * FROM comments ORDER BY comment_id DESC");
            
            if(posts) {
                // Add total likes
                posts.forEach(post => {
                    const totalLikes = likes.filter(like => like.post_id === post.post_id);
                    post.totalLikes = totalLikes.length;
                })

                // Add total comments
                posts.forEach(post => {
                    const totalComments = comments.filter(comment => comment.post_id === post.post_id);
                    post.totalComments = totalComments.length;
                })
            }

            res.render("blog.ejs", {
                user: user[0],
                posts: posts,
                likes: likes,
                comments: comments
            });
        })
    } else {
        res.redirect('/login');
    }
});

//handlers for sign up
app.post("/signing-up", async (req, res) => {
    const users = await runQuery("SELECT * FROM users");
    const hashedPassword = await bcrypt.hash(req.body.Password,10);    

    await runQuery("INSERT INTO users VALUES ($1,$2,$3) RETURNING *",
        [users[0] ? users[users.length - 1].user_id + 1 : 1, req.body.Username, hashedPassword])
        .then((insertedRow)=> {
            const maxAge = 3 * 60 * 60;
            const token = jwt.sign(
                {userid: insertedRow[0].user_id, username: insertedRow[0].username},
                jwtSecret,
                {expiresIn: maxAge}
            );
            res.cookie("jwt", token, {
                httpOnly: true,
                maxAge: maxAge * 1000,
            });
        })

    res.render('sign-up-successful.ejs');
})

app.post("/verify-username", async (req, res) => {
    const foundUser = await runQuery("SELECT * FROM users WHERE username = $1", [req.body.username])
    if (foundUser[0]) { res.json({ isUserAlreadyExisted: true }); console.log("user existed") } else { res.json({ isUserAlreadyExisted: false }); console.log("user not exist") }
})

app.post("/verify-password", async (req, res) => {
    const foundPassword = await runQuery("SELECT password FROM users WHERE username = $1", [req.body.username]);

    if (foundPassword[0]) {//check if the coresponding user's password in database is found or not

        bcrypt.compare(req.body.password,foundPassword[0].password).then((result)=> {
            result
            ?
            res.json({ isPasswordCorrect: true }) //password correct
            :
            res.json({ isPasswordCorrect: false })// password incorrect
        })
        
    } else {
        res.json({ isPasswordCorrect: false }) //user not found
    }


})

//handlers for login
app.post('/logging-in', async (req, res) => {
    await runQuery("SELECT * FROM users WHERE username = $1",[req.body.Username])
    .then((foundUser) => {
        const maxAge = 3 * 60 * 60;
        const token = jwt.sign(
            {userid: foundUser[0].user_id, username: foundUser[0].username},
            jwtSecret,
            {expiresIn: maxAge}
        );
        res.cookie("jwt", token, {
            httpOnly: true,
            maxAge: maxAge * 1000,
        });
    })

    res.redirect('/');
})

//handlers for blog app
app.post('/create-post', async (req,res)=> {
    var currentDate = new Date();
    var dateString = currentDate.getFullYear() + '-' + (currentDate.getMonth() + 1) + '-' + currentDate.getDate();
    var timeString = currentDate.getHours() + ':' + currentDate.getMinutes();
    var currentDateTime = dateString + ' ' + timeString;

    const result = await runQuery("SELECT post_id FROM posts ORDER BY post_id DESC LIMIT 1");
    const username = await runQuery("SELECT username FROM users WHERE user_id = $1",[req.body.userId]);

    await runQuery("INSERT INTO posts VALUES($1,$2,$3,$4,$5,$6)", [
        req.body.userId,
        result[0] ? result[0].post_id + 1 : 1,
        req.body.title,
        req.body.content,
        currentDateTime,
        username[0].username
    ]);

    res.redirect('/');
})

app.post('/update-post', async (req,res)=> {
    runQuery("UPDATE posts SET title = $1, content = $2 WHERE post_id = $3",
    [req.body.title, req.body.content, req.body.postId])
    .then(()=> res.status(200).json({message: "Update successful"}))
    .catch(error => {
        console.log(error);
        res.status(500).json({message: "Update unsuccessul: " + error});
    })
})

app.post('/delete-post',(req,res) =>{
    runQuery("DELETE FROM posts WHERE post_id = $1" , [req.body.postId])
    .then(()=> res.status(201).json({message: "Delete successfully"}))
    .catch( error => {
        console.log(error);
        res.status(500).json({message: "Delete failed: " + error})
    })
})

app.post('/like-post',async (req,res)=> {
    const result = await runQuery("SELECT like_id FROM likes ORDER BY like_id DESC LIMIT 1");

    runQuery("INSERT INTO likes VALUES($1,$2,$3)" , [
        result[0] ? result[0].like_id + 1 : 1,
        req.body.userId,
        req.body.postId
    ])
    .then(()=> res.status(201).json({message: "Like post successfully"}))
    .catch( error => {
        console.log(error);
        res.status(500).json({message: "Like post failed: " + error})
    })
})

app.post('/delete-like-post',(req,res)=> {

    runQuery("DELETE FROM likes WHERE post_id = $1 AND user_id = $2" , [req.body.postId, req.body.userId])
    .then(()=> res.status(201).json({message: "Delete like post successfully"}))
    .catch( error => {
        console.log(error);
        res.status(500).json({message: "Delete like post failed: " + error})
    })
})

app.post('/create-comment', async (req,res)=> {

    const commentId = await runQuery("SELECT comment_id FROM comments ORDER BY comment_id DESC LIMIT 1");

    runQuery("INSERT INTO comments VALUES ($1,$2,$3,$4,$5)",[
        commentId[0] ? commentId[0].comment_id + 1 : 1,
        req.body.postId,
        req.body.userId,
        req.body.username,
        req.body.content
    ])
    .then(()=> res.status(201).json({message: "comment created successfully"}))
    .catch( error => {
        console.log(error);
        res.status(500).json({message: "Failed to create comment: " + error})
    })
})

app.listen(port, () => {
    console.log("listening on port" + port);
});
