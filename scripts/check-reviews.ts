import { db } from "../app/db";
import { courseReviews, courses } from "../app/db/schema";
import { eq, avg, count } from "drizzle-orm";

// Check reviews in the database
const allCourses = db.select().from(courses).all();

console.log("\n=== Course Reviews Summary ===\n");

for (const course of allCourses) {
  const reviews = db
    .select()
    .from(courseReviews)
    .where(eq(courseReviews.courseId, course.id))
    .all();

  const avgRating = db
    .select({ average: avg(courseReviews.rating) })
    .from(courseReviews)
    .where(eq(courseReviews.courseId, course.id))
    .get();

  const reviewCount = db
    .select({ count: count() })
    .from(courseReviews)
    .where(eq(courseReviews.courseId, course.id))
    .get();

  console.log(`Course: ${course.title}`);
  console.log(`  Reviews: ${reviewCount?.count ?? 0}`);
  console.log(`  Average Rating: ${avgRating?.average ?? "N/A"}`);
  console.log(`  Individual ratings: ${reviews.map((r) => r.rating).join(", ")}`);
  console.log("");
}
