const express = require("express");
require("dotenv").config();
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.PAYMENT_KEY);
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unorthorized Access" });
  }
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "Unorthorized Access" });
    }

    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8ewx0me.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const allClassesCollection = client
      .db("DanceAcademyStudioDB")
      .collection("Classes");
    const allSelectedClasses = client
      .db("DanceAcademyStudioDB")
      .collection("selectedClasses");
    const usersCollection = client
      .db("DanceAcademyStudioDB")
      .collection("users");
    const paymentCollection = client
      .db("DanceAcademyStudioDB")
      .collection("payment");

    // jwt token
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // Classes
    app.post("/classes", async (req, res) => {
      const body = req.body;
      const result = await allClassesCollection.insertOne(body);
      res.send(result);
    });
    app.patch("/classes/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "Approved",
        },
      };
      const result = await allClassesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    app.get("/classes", async (req, res) => {
      const result = await allClassesCollection.find().toArray();
      res.send(result);
    });
    app.get("/myAddedClasses/:email", async (req, res) => {
      const email = req.params.email;
      const query = { instructorEmail: email };
      const result = await allClassesCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/dashboard/updateAddedClass/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await allClassesCollection.findOne(query);
      res.send(result);
    });
    app.patch("/dashboard/updateAddedClass/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedClass = req.body;
      const classes = {
        $set: {
          name: updatedClass.name,
          image: updatedClass.image,
          price: updatedClass.price,
          availableSeats: updatedClass.availableSeats,
        },
      };
      const result = await allClassesCollection.updateOne(filter, classes);
      res.send(result);
    });
    // Instructor

    app.get("/instructors", async (req, res) => {
      const query = { role: "instructor" };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });
    //selectedClass
    app.post("/selectClasses", async (req, res) => {
      const body = req.body;
      const result = await allSelectedClasses.insertOne(body);
      res.send(result);
    });

    app.get("/userSeclectedClass/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await allSelectedClasses.find(query).toArray();
      res.send(result);
    });

    app.delete("/deleteSelectedClass/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const restult = await allSelectedClasses.deleteOne(query);
      res.send(restult);
    });

    //users
    app.post("/users", async (req, res) => {
      const body = req.body;
      const query = { email: body?.email };
      const exestingUser = await usersCollection.findOne(query);
      if (exestingUser) {
        return res.send({ message: "user already exists" });
      }
    //   const result = await usersCollection.insertOne(body);
    //   res.send(result);
    // });

    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email != email) {
        res.send({ admin: false });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email != email) {
        res.send({ instructor: false });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    app.patch("/users/instructor/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "instructor",
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // payment
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/dashboard/payment/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await allSelectedClasses.findOne(query);
      res.send(result);
    });

    app.post("/payment", verifyJWT, async (req, res) => {
      const payment = req.body;
      const id = payment?.classId;
      console.log(payment);
      const insertResult = await paymentCollection.insertOne(payment);

      const query = { _id: new ObjectId(id) };

      const deleteResult = await allSelectedClasses.deleteOne(query);

      res.send({ insertResult, deleteResult });
    });

    app.get("/payment/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await clien
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to Dance academy Server");
});

app.listen(port);
