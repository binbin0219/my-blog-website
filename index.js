import express from "express"
import bodyParser from "body-parser"
import pg from "pg"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import cookieParser from "cookie-parser"

const app = express();
const port = process.env.PORT || 4000;
const jwtSecret = '1283fc47b7cd439a7f8e36e614a41fe519be35088befd42bc2fdf7130a646e9a75685b';
var user = [];
var posts = [];
var likes = [];
var postsCurrentUserLiked = [];
var likeCounter = 0;

const db = new pg.Client({
    connectionString: "postgres://my_blog_website_user:WRAmhlA7uuwc7n71YIz3mz0imaPD65Cw@dpg-cobasda1hbls73app2og-a.singapore-postgres.render.com/my_blog_website",
    ssl: {
        rejectUnauthorized: false // For self-signed certificates (optional)
    }
});
db.connect()
.then(()=> {console.log("database connected")})
.catch((error)=> {console.log(error)})

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
    const token = req.cookies.jwt;
    
    if(token){
        jwt.verify(token, jwtSecret, async (err, decodedToken)=> {
            (err)
            ?
            res.status(401).json({message: "user not authorized!"})
            :
            user = await db.query("SELECT * FROM users WHERE user_id = $1", [decodedToken.userid]);
            posts = await db.query("SELECT * FROM posts ORDER BY post_id DESC");
            likes = await db.query("SELECT * FROM likes");
            postsCurrentUserLiked = await db.query("SELECT * FROM likes WHERE user_id = $1" , [decodedToken.userid]);
            res.render("blog.ejs", {
                user: user.rows[0],
                posts: posts.rows,
                likes: likes.rows,
                postsCurrentUserLiked: postsCurrentUserLiked.rows,
                likeCounter: likeCounter
            });
        })
    } else {
        res.status(401).json({message: "user not authorized!"})
    }
});

//handlers for sign up
app.post("/signing-up", async (req, res) => {
    const users = await db.query("SELECT * FROM users");
    const hashedPassword = await bcrypt.hash(req.body.Password,10);    

    await db.query("INSERT INTO users VALUES ($1,$2,$3) RETURNING *",
        [users.rows[0] ? users.rows[users.rows.length - 1].user_id + 1 : 1, req.body.Username, hashedPassword])
        .then((insertedRow)=> {
            const maxAge = 3 * 60 * 60;
            const token = jwt.sign(
                {userid: insertedRow.rows[0].user_id, username: insertedRow.rows[0].username},
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
    const foundUser = await db.query("SELECT * FROM users WHERE username = $1", [req.body.username])
    if (foundUser.rows[0]) { res.json({ isUserAlreadyExisted: true }); console.log("user existed") } else { res.json({ isUserAlreadyExisted: false }); console.log("user not exist") }
})

app.post("/verify-password", async (req, res) => {
    const foundPassword = await db.query("SELECT password FROM users WHERE username = $1", [req.body.username]);

    if (foundPassword.rows[0]) {//check if the coresponding user's password in database is found or not

        bcrypt.compare(req.body.password,foundPassword.rows[0].password).then((result)=> {
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
    await db.query("SELECT * FROM users WHERE username = $1",[req.body.Username])
    .then((foundUser) => {
        const maxAge = 3 * 60 * 60;
        const token = jwt.sign(
            {userid: foundUser.rows[0].user_id, username: foundUser.rows[0].username},
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
    var dateString = currentDate.getFullYear() + '-' + (currentDate.getMonth() + 1) + '-' + currentDate.getDay();
    var timeString = currentDate.getHours() + ':' + currentDate.getMinutes();
    var currentDateTime = dateString + ' ' + timeString;
    const result = await db.query("SELECT post_id FROM posts ORDER BY post_id DESC LIMIT 1");
    const username = await db.query("SELECT username FROM users WHERE user_id = $1",[req.body.userId]);

    await db.query("INSERT INTO posts VALUES($1,$2,$3,$4,$5,$6)", [
        req.body.userId,
        result.rows[0] ? result.rows[0].post_id + 1 : 1,
        req.body.title,
        req.body.content,
        currentDateTime,
        username.rows[0].username
    ]);

    res.redirect('/');
})

app.post('/update-post', async (req,res)=> {
    db.query("UPDATE posts SET title = $1, content = $2 WHERE post_id = $3",
    [req.body.title, req.body.content, req.body.postId])
    .then(()=> res.status(200).json({message: "Update successful"}))
    .catch(error => {
        console.log(error);
        res.status(500).json({message: "Update unsuccessul: " + error});
    })
})

app.post('/delete-post',(req,res) =>{
    db.query("DELETE FROM posts WHERE post_id = $1" , [req.body.postId])
    .then(()=> res.status(201).json({message: "Delete successfully"}))
    .catch( error => {
        console.log(error);
        res.status(500).json({message: "Delete failed: " + error})
    })
})

app.post('/like-post',async (req,res)=> {
    const result = await db.query("SELECT like_id FROM likes ORDER BY like_id DESC LIMIT 1");

    db.query("INSERT INTO likes VALUES($1,$2,$3)" , [
        result.rows[0] ? result.rows[0].like_id + 1 : 1,
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

    db.query("DELETE FROM likes WHERE post_id = $1 AND user_id = $2" , [req.body.postId, req.body.userId])
    .then(()=> res.status(201).json({message: "Delete like post successfully"}))
    .catch( error => {
        console.log(error);
        res.status(500).json({message: "Delete like post failed: " + error})
    })
})

//handlers for to do app
app.post('/edit', async (req, res) => {

    await db.query("UPDATE tasks SET title = $1 WHERE id = $2", [req.body.updatedTask, req.body.taskId]);

    res.redirect('/');
});

app.post('/add', async (req, res) => {

    var result = await db.query("SELECT id FROM tasks");

    if (result.rows[0]) {
        var values = [result.rows[result.rows.length - 1].id + 1, req.body.newTask];
    } else {
        var values = [1, req.body.newTask];
    }


    await db.query("INSERT INTO tasks (id,title) VALUES ($1,$2)", values);

    res.redirect('/');
})

app.post('/delete', async (req, res) => {
    await db.query("DELETE FROM tasks WHERE id = $1", [req.body.taskId]);
    res.redirect('/');
})

app.listen(port, () => {
    console.log("listening on port" + port);
});
