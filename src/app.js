import express from "express";
import handlebars from "express-handlebars";
import { Server } from "socket.io";
import session from "express-session";
import MongoStore from "connect-mongo";
import cartsRouter from "./routes/carts.router.js";
import productsRouter from "./routes/products.router.js";
import viewsRouter from "./routes/views.router.js";
import testLoggerRouter from "./routes/loggerTest.router.js";
import path from "path";
import { fileURLToPath } from "url";
import { errorHandler } from "./middlewares/errorHandler.js";
import mongoose from "mongoose";
import ChatModel from "./dao/mongo/models/chat.model.js";
import "dotenv/config";
import sessionRouter from "./routes/sessions.router.js";
import passport from "passport";
import initializePassport from "./config/passport.config.js";
import { mongoConnectionLink, sessionSecret, port } from "./config/config.js";
import addLogger from "./middlewares/addLogger.middleware.js";
import usersRouter from "./routes/users.router.js";
import swaggerJsDoc from "swagger-jsdoc";
import swaggerUiExpress from "swagger-ui-express";

mongoose.connect(mongoConnectionLink).then(() => {
  console.log("Connected successfully");
});

const app = express();

app.use(addLogger);

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: mongoConnectionLink,
      ttl: 3600,
    }),
  })
);

initializePassport();
app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swaggerOptions = {
  definition: {
    openapi: "3.0.1",
    info: {
      title: "Documetación de Ecommerce CoderHouse",
      description: "API Ecommerce CoderHouse",
    },
  },
  apis: [`${__dirname}/docs/**/*.yaml`],
};

const specs = swaggerJsDoc(swaggerOptions);
app.use("/apidocs", swaggerUiExpress.serve, swaggerUiExpress.setup(specs));

app.engine("handlebars", handlebars.engine());
app.set("views", `${__dirname}/views`);
app.set("view engine", "handlebars");

app.use(express.static(`${__dirname}/public`));
app.use(express.static(`${__dirname}/dao`));

app.use("/api/carts", cartsRouter);
app.use("/api/products", productsRouter);
app.use("/api/sessions", sessionRouter);
app.use("/loggerTest", testLoggerRouter);
app.use("/api/users", usersRouter);
app.use("/", viewsRouter);
app.use(errorHandler);

const httpServer = app.listen(port, () =>
  console.log(`Running on port ${port}`)
);

const getMessages = async () => {
  let messages = await ChatModel.find().lean();
  return messages;
};

const io = new Server(httpServer);
app.set("io", io);

io.on("connection", (socket) => {
  console.log(`cliente conectado, id ${socket.id}`);

  socket.on("userMessage", async (messageData) => {
    try {
      console.log("mensaje", messageData);
      const newMessage = new ChatModel({
        user: messageData.user,
        message: messageData.message,
      });
      await newMessage.save();
      let messages = await getMessages();
      io.emit("messages", { messages });
    } catch (err) {
      console.error("Error saving message:", err);
    }
  });

  socket.on("authenticated", async ({ userEmail }) => {
    let messages = await getMessages();
    socket.emit("messages", { messages });
    socket.broadcast.emit("newUser", { newUserEmail: userEmail });
  });
});
