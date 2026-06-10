# Course Review System

## Overview
A star rating system that allows enrolled students to rate courses from 1-5 stars. Average ratings are displayed on course list and detail pages.

## Implementation Details

### Database Schema
- **Table**: `course_reviews`
  - `id`: Primary key (auto-increment)
  - `user_id`: Foreign key to users table
  - `course_id`: Foreign key to courses table
  - `rating`: Integer (1-5)
  - `created_at`: Timestamp
  - `updated_at`: Timestamp

### Service Layer
**File**: `app/services/reviewService.ts`
- `getAverageRatingForCourse(courseId)` - Returns average rating (rounded to 1 decimal)
- `getReviewCountForCourse(courseId)` - Returns total number of reviews
- `getUserReviewForCourse(userId, courseId)` - Gets a specific user's review
- `createOrUpdateReview(userId, courseId, rating)` - Creates or updates a review

### UI Components
**File**: `app/components/star-rating.tsx`
- Displays star ratings visually
- Supports both display mode and interactive mode
- Configurable sizes (sm, md, lg)
- Shows review count optionally

### Integration Points

#### 1. Course List Page (`app/routes/courses.tsx`)
- Displays average rating under course title in each card
- Shows review count (e.g., "4.3 (4 reviews)")
- Only shows ratings if reviews exist

#### 2. Course Detail Page (`app/routes/courses.$slug.tsx`)
- Shows average rating in the hero section
- Enrolled students can submit/update their rating via a form
- Interactive star selection interface
- Non-enrolled users cannot leave reviews

## Features
✅ Star rating visualization (1-5 stars)
✅ Average rating calculation
✅ Review count display
✅ Interactive rating submission for enrolled students
✅ Update existing reviews
✅ Responsive design
✅ Only enrolled students can review
✅ Instructors cannot review their own courses

## Testing
Sample data has been added via `scripts/reset-reviews.ts`:
- Course: "Introduction to TypeScript"
- 4 reviews with ratings: 5, 4, 5, 3
- Average rating: 4.3 stars

## Usage Example

### As a Student
1. Enroll in a course
2. Navigate to the course detail page
3. Scroll to the "Rate This Course" section
4. Click on stars to select your rating (1-5)
5. Click "Submit Review"
6. Your rating is saved and contributes to the course's average

### Updating a Review
1. Return to a course you've already reviewed
2. The current rating is pre-selected
3. Click a different star rating
4. Click "Update Review"

## Files Modified/Created

### Created
- `app/db/schema.ts` - Added `courseReviews` table
- `app/services/reviewService.ts` - Review service functions
- `app/components/star-rating.tsx` - Star rating UI component
- `drizzle/0003_sparkling_riptide.sql` - Database migration

### Modified
- `app/routes/courses.tsx` - Added ratings to course cards
- `app/routes/courses.$slug.tsx` - Added ratings display and review form
- `scripts/seed.ts` - Added course_reviews to drop table list

## Future Enhancements (Not Implemented)
- Written review comments (specifically excluded per requirements)
- Review moderation
- Review sorting/filtering
- Instructor response to reviews
- Review helpful votes
