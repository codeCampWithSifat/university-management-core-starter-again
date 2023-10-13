import { SemesterRegistrationStatus } from '@prisma/client';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError';
import prisma from '../../../shared/prisma';

const enrollIntoCourse = async (
  authUserId: string,
  payload: {
    offeredCourseId: string;
    offeredCourseSectionId: string;
  }
): Promise<{ message: string }> => {
  // console.log(authUserId, payload);
  const student = await prisma.student.findFirst({
    where: {
      studentId: authUserId,
    },
  });
  // console.log(student);
  const semesterRegistration = await prisma.semesterRegistration.findFirst({
    where: {
      status: SemesterRegistrationStatus.ONGOING,
    },
  });
  const offeredCourse = await prisma.offeredCourse.findFirst({
    where: {
      id: payload.offeredCourseId,
    },
    include: {
      course: true,
    },
  });
  const offeredCourseSection = await prisma.offeredCourseSection.findFirst({
    where: {
      id: payload.offeredCourseSectionId,
    },
  });
  if (!student) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Student Not Found');
  }
  if (!semesterRegistration) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Semester Registration Not Found');
  }
  if (!offeredCourse) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Offered Course Not Found');
  }
  if (!offeredCourseSection) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Offered Course Section Not Found'
    );
  }

  if (
    offeredCourseSection.maxCapacity &&
    offeredCourseSection.currentlyEnrolledStudent &&
    offeredCourseSection.currentlyEnrolledStudent >=
      offeredCourseSection.maxCapacity
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Enrollment Seat Has Remain Full'
    );
  }

  await prisma.$transaction(async transactionClient => {
    await transactionClient.studentSemesterRegistrationCourse.create({
      data: {
        studentId: student?.id,
        semesterRegistrationId: semesterRegistration?.id,
        offeredCourseId: payload.offeredCourseId,
        offeredCourseSectionId: payload.offeredCourseSectionId,
      },
    });

    await transactionClient.offeredCourseSection.update({
      where: {
        id: payload.offeredCourseSectionId,
      },
      data: {
        currentlyEnrolledStudent: {
          increment: 1,
        },
      },
    });

    await transactionClient.studentSemesterRegistration.updateMany({
      where: {
        student: {
          id: student?.id,
        },
        semesterRegistration: {
          id: semesterRegistration?.id,
        },
      },
      data: {
        totalCreditsTaken: {
          increment: offeredCourse.course.credits,
        },
      },
    });
  });

  return {
    message: 'Successfully Enrolled Into Course',
  };
};

const withdrawFromCourse = async (
  authUserId: string,
  payload: {
    offeredCourseId: string;
    offeredCourseSectionId: string;
  }
): Promise<{ message: string }> => {
  // console.log(authUserId, payload);
  const student = await prisma.student.findFirst({
    where: {
      studentId: authUserId,
    },
  });
  // console.log(student);
  const semesterRegistration = await prisma.semesterRegistration.findFirst({
    where: {
      status: SemesterRegistrationStatus.ONGOING,
    },
  });
  const offeredCourse = await prisma.offeredCourse.findFirst({
    where: {
      id: payload.offeredCourseId,
    },
    include: {
      course: true,
    },
  });

  if (!student) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Student Not Found');
  }
  if (!semesterRegistration) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Semester Registration Not Found');
  }
  if (!offeredCourse) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Offered Course Not Found');
  }

  await prisma.$transaction(async transactionClient => {
    const data =
      await transactionClient.studentSemesterRegistrationCourse.delete({
        where: {
          semesterRegistrationId_studentId_offeredCourseId: {
            semesterRegistrationId: semesterRegistration.id,
            studentId: student.id,
            offeredCourseId: payload.offeredCourseId,
          },
        },
      });
    console.log(data);
    await transactionClient.offeredCourseSection.update({
      where: {
        id: payload.offeredCourseSectionId,
      },
      data: {
        currentlyEnrolledStudent: {
          decrement: 1,
        },
      },
    });

    await transactionClient.studentSemesterRegistration.updateMany({
      where: {
        student: {
          id: student?.id,
        },
        semesterRegistration: {
          id: semesterRegistration?.id,
        },
      },
      data: {
        totalCreditsTaken: {
          decrement: offeredCourse.course.credits,
        },
      },
    });
  });

  return {
    message: 'Successfully WithDraw From  Course',
  };
};

export const StudentSemesterRegistrationCourseService = {
  enrollIntoCourse,
  withdrawFromCourse,
};
