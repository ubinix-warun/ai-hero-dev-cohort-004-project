import { db } from "../app/db";
import { courseReviews, courses, users, enrollments } from "../app/db/schema";
import { eq } from "drizzle-orm";

// Add some test reviews to the first course
const firstCourse = db.select().from(courses).limit(1).get();

if (!firstCourse) {
  console.log("No courses found in database");
  process.exit(0);
}

console.log(`Adding test reviews for course: ${firstCourse.title}`);

// Get enrolled users for this course
const enrolledUsers = db
  .select({ userId: enrollments.userId })
  .from(enrollments)
  .where(eq(enrollments.courseId, firstCourse.id))
  .all();

console.log(`Found ${enrolledUsers.length} enrolled users`);

// Add test reviews with different ratings for enrolled users
const testReviews = [
  { userId: enrolledUsers[0]?.userId, rating: 5 },
  { userId: enrolledUsers[1]?.userId, rating: 4 },
  { userId: enrolledUsers[2]?.userId, rating: 5 },
  { userId: enrolledUsers[3]?.userId, rating: 3 },
];

for (const review of testReviews) {
  if (review.userId) {
    const existing = db
      .select()
      .from(courseReviews)
      .where(eq(courseReviews.userId, review.userId))
      .where(eq(courseReviews.courseId, firstCourse.id))
      .get();

    if (!existing) {
      db.insert(courseReviews)
        .values({
          userId: review.userId,
          courseId: firstCourse.id,
          rating: review.rating,
        })
        .run();
      console.log(`Added ${review.rating}-star review for user ${review.userId}`);
    } else {
      console.log(`Review already exists for user ${review.userId}`);
    }
  }
}

console.log("Test reviews added successfully!");
