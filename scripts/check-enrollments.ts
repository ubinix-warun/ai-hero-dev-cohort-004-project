import { db } from "../app/db";
import { enrollments, users, courses } from "../app/db/schema";
import { eq } from "drizzle-orm";

// Check enrollments
const firstCourse = db.select().from(courses).limit(1).get();
console.log(`\nChecking enrollments for: ${firstCourse?.title}\n`);

if (firstCourse) {
  const courseEnrollments = db
    .select({
      userId: enrollments.userId,
      userName: users.name,
      enrolledAt: enrollments.enrolledAt,
    })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.userId, users.id))
    .where(eq(enrollments.courseId, firstCourse.id))
    .all();

  console.log(`Total enrollments: ${courseEnrollments.length}\n`);
  courseEnrollments.forEach((e) => {
    console.log(`- User ${e.userId}: ${e.userName} (enrolled ${e.enrolledAt})`);
  });
}
