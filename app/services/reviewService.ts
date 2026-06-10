import { db } from "~/db";
import { courseReviews } from "~/db/schema";
import { eq, and, avg, count } from "drizzle-orm";

export function getAverageRatingForCourse(courseId: number): number | null {
  const result = db
    .select({ average: avg(courseReviews.rating) })
    .from(courseReviews)
    .where(eq(courseReviews.courseId, courseId))
    .get();

  if (!result?.average) {
    return null;
  }

  return Math.round(parseFloat(result.average) * 10) / 10;
}

export function getReviewCountForCourse(courseId: number): number {
  const result = db
    .select({ count: count() })
    .from(courseReviews)
    .where(eq(courseReviews.courseId, courseId))
    .get();

  return result?.count ?? 0;
}

export function getUserReviewForCourse(
  userId: number,
  courseId: number
): { id: number; rating: number } | null {
  return (
    db
      .select({ id: courseReviews.id, rating: courseReviews.rating })
      .from(courseReviews)
      .where(
        and(
          eq(courseReviews.userId, userId),
          eq(courseReviews.courseId, courseId)
        )
      )
      .get() ?? null
  );
}

export function createOrUpdateReview(
  userId: number,
  courseId: number,
  rating: number
): void {
  const existingReview = getUserReviewForCourse(userId, courseId);

  if (existingReview) {
    db.update(courseReviews)
      .set({
        rating,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(courseReviews.id, existingReview.id))
      .run();
  } else {
    db.insert(courseReviews)
      .values({
        userId,
        courseId,
        rating,
      })
      .run();
  }
}
