import { eq, asc, count } from "drizzle-orm";
import { db } from "~/db";
import {
  lessonComments,
  users,
  lessons,
  modules,
  UserRole,
} from "~/db/schema";

const commentAuthorFields = {
  userName: users.name,
  userAvatarUrl: users.avatarUrl,
  userRole: users.role,
};

export type CommentWithAuthor = {
  id: number;
  userId: number;
  lessonId: number;
  content: string;
  createdAt: string;
  userName: string;
  userAvatarUrl: string | null;
  userRole: UserRole;
};

export function getCommentsForLesson(lessonId: number): CommentWithAuthor[] {
  return db
    .select({
      id: lessonComments.id,
      userId: lessonComments.userId,
      lessonId: lessonComments.lessonId,
      content: lessonComments.content,
      createdAt: lessonComments.createdAt,
      ...commentAuthorFields,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(eq(lessonComments.lessonId, lessonId))
    .orderBy(asc(lessonComments.createdAt))
    .all();
}

export function getCommentCountForLesson(lessonId: number): number {
  const result = db
    .select({ count: count() })
    .from(lessonComments)
    .where(eq(lessonComments.lessonId, lessonId))
    .get();

  return result?.count ?? 0;
}

export function getCommentById(commentId: number) {
  return (
    db
      .select()
      .from(lessonComments)
      .where(eq(lessonComments.id, commentId))
      .get() ?? null
  );
}

export function getCourseIdForLesson(lessonId: number): number | null {
  const result = db
    .select({ courseId: modules.courseId })
    .from(modules)
    .innerJoin(lessons, eq(lessons.moduleId, modules.id))
    .where(eq(lessons.id, lessonId))
    .get();

  return result?.courseId ?? null;
}

export function createComment(
  userId: number,
  lessonId: number,
  content: string
) {
  const [inserted] = db
    .insert(lessonComments)
    .values({ userId, lessonId, content })
    .returning()
    .all();

  return inserted;
}

// Hard-deletes a comment by its id. Authorization (owner or course instructor)
// is enforced in the route action before calling this.
export function deleteComment(commentId: number): void {
  db.delete(lessonComments).where(eq(lessonComments.id, commentId)).run();
}
