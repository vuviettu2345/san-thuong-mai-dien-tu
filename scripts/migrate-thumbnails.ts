import fs from "fs";
import path from "path";
import { db } from "../server/db";
import { products } from "../shared/schema";
import { eq } from "drizzle-orm";

const thumbnailsDir = path.join(process.env.HOME || "/home/runner", ".data", "uploads", "thumbnails");
const projectThumbnailsDir = path.join(process.cwd(), "uploads", "thumbnails");

async function migrateThumnails() {
  console.log("Starting thumbnail migration to database...");

  const allProducts = await db.select().from(products);
  console.log(`Found ${allProducts.length} products`);

  for (const product of allProducts) {
    if (product.thumbnailData) {
      console.log(`Product ${product.id} already has thumbnail data, skipping`);
      continue;
    }

    if (!product.thumbnailUrl) {
      console.log(`Product ${product.id} has no thumbnail URL, skipping`);
      continue;
    }

    const filename = path.basename(product.thumbnailUrl);
    let filePath = path.join(thumbnailsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      filePath = path.join(projectThumbnailsDir, filename);
    }

    if (!fs.existsSync(filePath)) {
      console.log(`Thumbnail file not found for product ${product.id}: ${filename}`);
      continue;
    }

    try {
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filename).toLowerCase();
      const mimeType = ext === ".png" ? "image/png" :
                       ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
                       ext === ".gif" ? "image/gif" :
                       ext === ".webp" ? "image/webp" : "image/png";
      
      const base64Data = `data:${mimeType};base64,${buffer.toString("base64")}`;
      
      await db.update(products)
        .set({ 
          thumbnailData: base64Data,
          thumbnailUrl: `/api/products/${product.id}/thumbnail`,
          updatedAt: new Date()
        })
        .where(eq(products.id, product.id));
      
      console.log(`Migrated thumbnail for product ${product.id}: ${filename} (${base64Data.length} chars)`);
    } catch (error) {
      console.error(`Error migrating thumbnail for product ${product.id}:`, error);
    }
  }

  console.log("Thumbnail migration completed!");
  process.exit(0);
}

migrateThumnails().catch(console.error);
