import { db } from "../app/db";
import { courseReviews, enrollments, courses } from "../app/db/schema";
import { eq } from "drizzle-orm";

// Delete all reviews and re-add with varied ratings
db.delete(courseReviews).run();
console.log("Deleted all existing reviews");

const firstCourse = db.select().from(courses).limit(1).get();

if (!firstCourse) {
  console.log("No courses found");
  process.exit(0);
}

const enrolledUsers = db
  .select({ userId: enrollments.userId })
  .from(enrollments)
  .where(eq(enrollments.courseId, firstCourse.id))
  .all();

console.log(`Adding reviews for ${enrolledUsers.length} enrolled users`);

const ratings = [5, 4, 5, 3];

for (let i = 0; i < enrolledUsers.length; i++) {
  const userId = enrolledUsers[i]?.userId;
  const rating = ratings[i];
  if (userId && rating) {
    db.insert(courseReviews)
      .values({
        userId,
        courseId: firstCourse.id,
        rating,
      })
      .run();
    console.log(`Added ${rating}-star review for user ${userId}`);
  }
}

console.log("\nDone! Average should be 4.25 stars");
