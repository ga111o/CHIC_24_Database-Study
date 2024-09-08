const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const app = express();

dotenv.config(); // 환경 변수 로드

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

const mysql = require("mysql2/promise");

const conn = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

app.get("/", (req, res) => {
  return res.json("From backendSide");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

app.post("/admin/save", async (req, res) => {
  const {
    restaurant_name,
    ismeal,
    signature_menu,
    signature_menu_price,
    distance,
    can_delivery,
    can_many_people,
    can_ca_gong,
    running_day,
    weekday_running_time,
    weekend_running_time,
    food_types,
    menu_items,
  } = req.body;

  const processedData = {
    restaurant_name,
    ismeal: ismeal !== null ? ismeal : false,
    signature_menu,
    signature_menu_price,
    distance,
    can_delivery: can_delivery !== null ? can_delivery : false,
    can_many_people: can_many_people !== null ? can_many_people : false,
    can_ca_gong: can_ca_gong !== null ? can_ca_gong : false,
    running_day,
    weekday_running_time,
    weekend_running_time,
    food_types,
    menu_items,
  };

  console.log(processedData);

  try {
    const [result] = await conn.query(
      `
      INSERT INTO restaurant (restaurant_name, is_meal, signature_menu, signature_menu_price, distance, can_delivery, can_many_people, can_ca_gong)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        processedData.restaurant_name,
        processedData.ismeal,
        processedData.signature_menu,
        processedData.signature_menu_price,
        processedData.distance,
        processedData.can_delivery,
        processedData.can_many_people,
        processedData.can_ca_gong,
      ]
    );

    const restaurantId = result.insertId;

    await conn.query(
      `
      INSERT INTO restaurant_detail (id, running_day, weekday_running_time, weekend_running_time)
      VALUES (?, ?, ?, ?)
    `,
      [restaurantId, running_day, weekday_running_time, weekend_running_time]
    );

    if (food_types && Array.isArray(food_types)) {
      const foodTypePromises = food_types.map(async (food_type) => {
        await conn.query(
          `
          INSERT INTO food_type (id, food_type)
          VALUES (?, ?)
        `,
          [restaurantId, food_type]
        );
      });
      await Promise.all(foodTypePromises);
    }

    if (menu_items && Array.isArray(menu_items)) {
      const menuPromises = menu_items.map(async (menu_item) => {
        const {
          menu_name,
          menu_price,
          menu_type,
          detail_menu_type,
          menu_description,
        } = menu_item;

        const [menuResult] = await conn.query(
          `
          INSERT INTO menu (id, menu_name, menu_price)
          VALUES (?, ?, ?)
        `,
          [restaurantId, menu_name, menu_price]
        );

        const menuId = menuResult.insertId;

        await conn.query(
          `
          INSERT INTO menu_type (menu_id, menu_type, detail_menu_type, menu_description)
          VALUES (?, ?, ?, ?)
        `,
          [menuId, menu_type, detail_menu_type, menu_description]
        );
      });
      await Promise.all(menuPromises);
    }

    res.status(200).send("Data saved successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send(err);
  }
});

app.get("/admin/data", async (req, res) => {
  try {
    const [restaurants] = await conn.query(`
      SELECT r.*, rd.running_day, rd.weekday_running_time, rd.weekend_running_time
      FROM restaurant r
      LEFT JOIN restaurant_detail rd ON r.id = rd.id
    `);

    const restaurantIds = restaurants.map((restaurant) => restaurant.id);
    const [foodTypes] = await conn.query(
      `
      SELECT * FROM food_type WHERE id IN (?)
    `,
      [restaurantIds]
    );

    const [menus] = await conn.query(
      `
      SELECT * FROM menu WHERE id IN (?)
    `,
      [restaurantIds]
    );

    const [menuTypes] = await conn.query(
      `
      SELECT * FROM menu_type WHERE menu_id IN (?)
    `,
      [menus.map((menu) => menu.id)]
    );

    const result = restaurants.map((restaurant) => ({
      ...restaurant,
      food_types: foodTypes.filter((ft) => ft.id === restaurant.id),
      menus: menus
        .filter((m) => m.id === restaurant.id)
        .map((menu) => ({
          ...menu,
          menu_types: menuTypes.filter((mt) => mt.menu_id === menu.id),
        })),
    }));

    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).send(err);
  }
});
