/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Course,
  OfferedCourse,
  Prisma,
  SemesterRegistration,
  SemesterRegistrationStatus,
  StudentEnrolledCourseStatus,
  StudentSemesterRegistration,
  StudentSemesterRegistrationCourse,
} from '@prisma/client';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError';
import { paginationHelpers } from '../../../helpers/paginationHelper';
import { IGenericResponse } from '../../../interfaces/common';
import { IPaginationOptions } from '../../../interfaces/pagination';
import prisma from '../../../shared/prisma';
import { asyncForEach } from '../../../shared/utils';
import { StudentEnrolledCourseMarkService } from '../studentEnrolledCourseMark/studentEnrolledCourseMark.service';
import { StudentSemesterPaymentService } from '../studentSemesterPayment/studentSemesterPayment.service';
import { StudentSemesterRegistrationCourseService } from '../studentSemesterRegistrationCourse/studentSemesterRegistrationCourse.service';
import {
  semesterRegistrationRelationalFields,
  semesterRegistrationRelationalFieldsMapper,
  semesterRegistrationSearchableFields,
} from './semesterRegistration.constants';
import { ISemesterRegistrationFilterRequest } from './semesterRegistration.interface';
import { SemesterRegistrationUtils } from './semesterRegistration.utils';

const insertIntoDB = async (
  data: SemesterRegistration
): Promise<SemesterRegistration> => {
  const isAnySemesterRegistrationUpcomingOrOngoing =
    await prisma.semesterRegistration.findFirst({
      where: {
        OR: [
          {
            status: SemesterRegistrationStatus.UPCOMING,
          },
          {
            status: SemesterRegistrationStatus.ONGOING,
          },
        ],
      },
    });

  if (isAnySemesterRegistrationUpcomingOrOngoing) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `There is already an ${isAnySemesterRegistrationUpcomingOrOngoing.status} registration`
    );
  }
  const result = await prisma.semesterRegistration.create({
    data,
    include: {
      academicSemester: true,
    },
  });
  return result;
};

const getAllFromDB = async (
  filters: ISemesterRegistrationFilterRequest,
  options: IPaginationOptions
): Promise<IGenericResponse<SemesterRegistration[]>> => {
  const { page, limit, skip } = paginationHelpers.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions = [];

  if (searchTerm) {
    andConditions.push({
      OR: semesterRegistrationSearchableFields.map(fields => ({
        [fields]: {
          contains: searchTerm,
          mode: 'insensitive',
        },
      })),
    });
  }

  if (Object.keys(filterData).length > 0) {
    andConditions.push({
      AND: Object.keys(filterData).map(key => {
        if (semesterRegistrationRelationalFields.includes(key)) {
          return {
            [semesterRegistrationRelationalFieldsMapper[key]]: {
              id: (filterData as any)[key],
            },
          };
        } else {
          return {
            [key]: {
              equals: (filterData as any)[key],
            },
          };
        }
      }),
    });
  }
  const whereConditions: Prisma.SemesterRegistrationWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const result = await prisma.semesterRegistration.findMany({
    where: whereConditions,
    take: limit,
    skip,
    include: {
      academicSemester: true,
    },
    orderBy:
      options.sortBy && options.sortOrder
        ? { [options.sortBy]: options.sortOrder }
        : { createdAt: 'asc' },
  });

  const total = await prisma.semesterRegistration.count({
    where: whereConditions,
  });

  return {
    meta: {
      page,
      total,
      limit,
    },
    data: result,
  };
};

const getIdFromDB = async (
  id: string
): Promise<SemesterRegistration | null> => {
  const result = await prisma.semesterRegistration.findUnique({
    where: {
      id,
    },
    include: {
      academicSemester: true,
    },
  });
  return result;
};

// UPCOMING || ONGOING || ENDED
const updateOneFromDB = async (
  id: string,
  payload: Partial<SemesterRegistration>
): Promise<SemesterRegistration> => {
  const isExists = await prisma.semesterRegistration.findUnique({
    where: {
      id,
    },
  });
  if (!isExists) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Data Not Found');
  }
  if (
    payload.status &&
    isExists.status === SemesterRegistrationStatus.UPCOMING &&
    payload.status !== SemesterRegistrationStatus.ONGOING
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Can Only Move From Upcoming To Ongoing'
    );
  }

  if (
    payload.status &&
    isExists.status === SemesterRegistrationStatus.ONGOING &&
    payload.status !== SemesterRegistrationStatus.ENDED
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Can Only Move From Ongoing To Ended'
    );
  }
  const result = await prisma.semesterRegistration.update({
    where: {
      id,
    },
    data: payload,
    include: {
      academicSemester: true,
    },
  });
  return result;
};

const deleteIdFromDB = async (id: string): Promise<SemesterRegistration> => {
  const result = await prisma.semesterRegistration.delete({
    where: {
      id,
    },
    include: {
      academicSemester: true,
    },
  });
  return result;
};

const startMyRegistration = async (
  authUserId: string
): Promise<{
  semesterRegistration: SemesterRegistration | null | undefined;
  studentSemesterRegistration: StudentSemesterRegistration | null | undefined;
}> => {
  const studentInfo = await prisma.student.findFirst({
    where: {
      studentId: authUserId,
    },
  });

  if (!studentInfo) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Student Not Found');
  }

  const semesterRegistrationInfo = await prisma.semesterRegistration.findFirst({
    where: {
      status: {
        in: [
          SemesterRegistrationStatus.UPCOMING,
          SemesterRegistrationStatus.ONGOING,
        ],
      },
    },
  });

  if (
    semesterRegistrationInfo?.status === SemesterRegistrationStatus.UPCOMING
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Registration Is Not Started Yet'
    );
  }

  let studentRegistration = await prisma.studentSemesterRegistration.findFirst({
    where: {
      student: {
        id: studentInfo?.id,
      },
      semesterRegistration: {
        id: semesterRegistrationInfo?.id,
      },
    },
  });

  if (!studentRegistration) {
    studentRegistration = await prisma.studentSemesterRegistration.create({
      data: {
        student: {
          connect: {
            id: studentInfo?.id,
          },
        },
        semesterRegistration: {
          connect: {
            id: semesterRegistrationInfo?.id,
          },
        },
      },
    });
  }

  return {
    semesterRegistration: semesterRegistrationInfo,
    studentSemesterRegistration: studentRegistration,
  };
};

const enrollIntoCourse = async (
  authUserId: string,
  payload: {
    offeredCourseId: string;
    offeredCourseSectionId: string;
  }
): Promise<{ message: string }> => {
  // const student = await prisma.student.findFirst({
  //   where: {
  //     studentId: authUserId,
  //   },
  // });
  // // console.log(student);
  // const semesterRegistration = await prisma.semesterRegistration.findFirst({
  //   where: {
  //     status: SemesterRegistrationStatus.ONGOING,
  //   },
  // });
  // const offeredCourse = await prisma.offeredCourse.findFirst({
  //   where: {
  //     id: payload.offeredCourseId,
  //   },
  //   include: {
  //     course: true,
  //   },
  // });
  // const offeredCourseSection = await prisma.offeredCourseSection.findFirst({
  //   where: {
  //     id: payload.offeredCourseSectionId,
  //   },
  // });
  // if (!student) {
  //   throw new ApiError(httpStatus.NOT_FOUND, 'Student Not Found');
  // }
  // if (!semesterRegistration) {
  //   throw new ApiError(httpStatus.NOT_FOUND, 'Semester Registration Not Found');
  // }
  // if (!offeredCourse) {
  //   throw new ApiError(httpStatus.NOT_FOUND, 'Offered Course Not Found');
  // }
  // if (!offeredCourseSection) {
  //   throw new ApiError(
  //     httpStatus.NOT_FOUND,
  //     'Offered Course Section Not Found'
  //   );
  // }

  // if (
  //   offeredCourseSection.maxCapacity &&
  //   offeredCourseSection.currentlyEnrolledStudent &&
  //   offeredCourseSection.currentlyEnrolledStudent >=
  //     offeredCourseSection.maxCapacity
  // ) {
  //   throw new ApiError(
  //     httpStatus.BAD_REQUEST,
  //     'Enrollment Seat Has Remain Full'
  //   );
  // }

  // await prisma.$transaction(async transactionClient => {
  //   await transactionClient.studentSemesterRegistrationCourse.create({
  //     data: {
  //       studentId: student?.id,
  //       semesterRegistrationId: semesterRegistration?.id,
  //       offeredCourseId: payload.offeredCourseId,
  //       offeredCourseSectionId: payload.offeredCourseSectionId,
  //     },
  //   });

  //   await transactionClient.offeredCourseSection.update({
  //     where: {
  //       id: payload.offeredCourseSectionId,
  //     },
  //     data: {
  //       currentlyEnrolledStudent: {
  //         increment: 1,
  //       },
  //     },
  //   });

  //   await transactionClient.studentSemesterRegistration.updateMany({
  //     where: {
  //       student: {
  //         id: student?.id,
  //       },
  //       semesterRegistration: {
  //         id: semesterRegistration?.id,
  //       },
  //     },
  //     data: {
  //       totalCreditsTaken: {
  //         increment: offeredCourse.course.credits,
  //       },
  //     },
  //   });
  // });

  // return {
  //   message: 'Successfully Enrolled Into Course',
  // };

  return await StudentSemesterRegistrationCourseService.enrollIntoCourse(
    authUserId,
    payload
  );
};

const withdrawFromCourse = async (
  authUserId: string,
  payload: {
    offeredCourseId: string;
    offeredCourseSectionId: string;
  }
): Promise<{ message: string }> => {
  // const student = await prisma.student.findFirst({
  //   where: {
  //     studentId: authUserId,
  //   },
  // });
  // const semesterRegistration = await prisma.semesterRegistration.findFirst({
  //   where: {
  //     status: SemesterRegistrationStatus.ONGOING,
  //   },
  // });
  // const offeredCourse = await prisma.offeredCourse.findFirst({
  //   where: {
  //     id: payload.offeredCourseId,
  //   },
  //   include: {
  //     course: true,
  //   },
  // });

  // if (!student) {
  //   throw new ApiError(httpStatus.NOT_FOUND, 'Student Not Found');
  // }
  // if (!semesterRegistration) {
  //   throw new ApiError(httpStatus.NOT_FOUND, 'Semester Registration Not Found');
  // }
  // if (!offeredCourse) {
  //   throw new ApiError(httpStatus.NOT_FOUND, 'Offered Course Not Found');
  // }

  // await prisma.$transaction(async transactionClient => {
  //   const data =
  //     await transactionClient.studentSemesterRegistrationCourse.delete({
  //       where: {
  //         semesterRegistrationId_studentId_offeredCourseId: {
  //           semesterRegistrationId: semesterRegistration.id,
  //           studentId: student.id,
  //           offeredCourseId: payload.offeredCourseId,
  //         },
  //       },
  //     });
  //   console.log(data);
  //   await transactionClient.offeredCourseSection.update({
  //     where: {
  //       id: payload.offeredCourseSectionId,
  //     },
  //     data: {
  //       currentlyEnrolledStudent: {
  //         decrement: 1,
  //       },
  //     },
  //   });

  //   await transactionClient.studentSemesterRegistration.updateMany({
  //     where: {
  //       student: {
  //         id: student?.id,
  //       },
  //       semesterRegistration: {
  //         id: semesterRegistration?.id,
  //       },
  //     },
  //     data: {
  //       totalCreditsTaken: {
  //         decrement: offeredCourse.course.credits,
  //       },
  //     },
  //   });
  // });

  // return {
  //   message: 'Successfully WithDraw From  Course',

  return await StudentSemesterRegistrationCourseService.withdrawFromCourse(
    authUserId,
    payload
  );
};

const confirmMyRegistration = async (
  authUserId: string
): Promise<{ message: string }> => {
  const semesterRegistration = await prisma.semesterRegistration.findFirst({
    where: {
      status: SemesterRegistrationStatus.ONGOING,
    },
  });
  const studentSemesterRegistration =
    await prisma.studentSemesterRegistration.findFirst({
      where: {
        semesterRegistration: {
          id: semesterRegistration?.id,
        },
        student: {
          studentId: authUserId,
        },
      },
    });

  // console.log('semester Registration', semesterRegistration);
  // console.log('student semester Registration', studentSemesterRegistration);

  if (!studentSemesterRegistration) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'You Are reconnized For This Semester'
    );
  }

  if (studentSemesterRegistration.totalCreditsTaken === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `You Cant Not Confirm Your Course For ${studentSemesterRegistration.totalCreditsTaken} Credits`
    );
  }

  if (
    studentSemesterRegistration.totalCreditsTaken &&
    semesterRegistration?.minCredit &&
    semesterRegistration?.maxCredit &&
    (studentSemesterRegistration.totalCreditsTaken <
      semesterRegistration.minCredit ||
      studentSemesterRegistration.totalCreditsTaken >
        semesterRegistration?.maxCredit)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `You Can Take Only${semesterRegistration.minCredit} To ${semesterRegistration.maxCredit} Credits`
    );
  }

  await prisma.studentSemesterRegistration.update({
    where: {
      id: studentSemesterRegistration?.id,
    },
    data: {
      isConfirmed: true,
    },
  });

  return {
    message: 'Confirm My Registration Successfully',
  };
};

const getMyRegistration = async (authUserId: string) => {
  const semesterRegistration = await prisma.semesterRegistration.findFirst({
    where: {
      status: SemesterRegistrationStatus.ONGOING,
    },
    include: {
      academicSemester: true,
    },
  });

  const studentSemesterRegistration =
    await prisma.studentSemesterRegistration.findFirst({
      where: {
        semesterRegistration: {
          id: semesterRegistration?.id,
        },
        student: {
          studentId: authUserId,
        },
      },
      include: {
        student: true,
      },
    });

  return {
    semesterRegistration,
    studentSemesterRegistration,
  };
};

// const startNewSemester = async (id: string) => {
//   // console.log(id);
//   const semesterRegistration = await prisma.semesterRegistration.findUnique({
//     where: {
//       id,
//     },
//     include: {
//       academicSemester: true,
//     },
//   });

//   if (!semesterRegistration) {
//     throw new ApiError(httpStatus.NOT_FOUND, 'Semester Registration Not Found');
//   }

//   if (semesterRegistration.status !== SemesterRegistrationStatus.ENDED) {
//     throw new ApiError(
//       httpStatus.BAD_REQUEST,
//       'Semester Registration Is Not Ended Yet'
//     );
//   }

//   // if (semesterRegistration.academicSemester.isCurrent) {
//   //   throw new ApiError(httpStatus.NOT_FOUND, 'Semester is already started');
//   // }

//   await prisma.$transaction(async prismaTransactionClient => {
//     await prismaTransactionClient.academicSemester.updateMany({
//       where: {
//         isCurrent: true,
//       },
//       data: {
//         isCurrent: false,
//       },
//     });

//     await prismaTransactionClient.academicSemester.update({
//       where: {
//         id: semesterRegistration.academicSemester.id,
//       },
//       data: {
//         isCurrent: true,
//       },
//     });

//     const studentSemesterRegistrations =
//       await prisma.studentSemesterRegistration.findMany({
//         where: {
//           semesterRegistration: {
//             id: id,
//           },
//           isConfirmed: true,
//         },
//       });

//     asyncForEach(
//       studentSemesterRegistrations,
//       async (studentSemReg: StudentSemesterRegistration) => {
//         if (studentSemReg.totalCreditsTaken) {
//           const totalPaymentAmount = studentSemReg.totalCreditsTaken * 5000;
//           await StudentSemesterPaymentService.createSemesterPayment(
//             prismaTransactionClient,
//             {
//               studentId: studentSemReg.studentId,
//               academicSemesterId: semesterRegistration.academicSemesterId,
//               totalPaymentAmount: totalPaymentAmount,
//             }
//           );
//         }

//         const studentSemesterRegistrationCourses =
//           await prismaTransactionClient.studentSemesterRegistrationCourse.findMany(
//             {
//               where: {
//                 semesterRegistration: {
//                   id,
//                 },
//                 student: {
//                   id: studentSemReg.studentId,
//                 },
//               },
//               include: {
//                 offeredCourse: {
//                   include: {
//                     course: true,
//                   },
//                 },
//               },
//             }
//           );
//         asyncForEach(
//           studentSemesterRegistrationCourses,
//           async (
//             item: StudentSemesterRegistrationCourse & {
//               offeredCourse: OfferedCourse & {
//                 course: Course;
//               };
//             }
//           ) => {
//             const isExistEnrolledData =
//               await prismaTransactionClient.studentEnrolledCourse.findFirst({
//                 where: {
//                   studentId: item.studentId,
//                   courseId: item.offeredCourse.courseId,
//                   academicSemesterId: semesterRegistration.academicSemesterId,
//                 },
//               });

//             if (!isExistEnrolledData) {
//               const enrolledCourseData = {
//                 studentId: item.studentId,
//                 courseId: item.offeredCourse.courseId,
//                 academicSemesterId: semesterRegistration.academicSemesterId,
//               };

//               await prismaTransactionClient.studentEnrolledCourse.create({
//                 data: enrolledCourseData,
//               });
//             }
//           }
//         );
//       }
//     );
//   });

//   return {
//     message: 'Semester Started Successfully',
//   };
// };

const startNewSemester = async (
  id: string
): Promise<{
  message: string;
}> => {
  const semesterRegistration = await prisma.semesterRegistration.findUnique({
    where: {
      id,
    },
    include: {
      academicSemester: true,
    },
  });

  if (!semesterRegistration) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Semester Registration Not found!'
    );
  }

  if (semesterRegistration.status !== SemesterRegistrationStatus.ENDED) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Semester Registration is not ended yet!'
    );
  }

  if (semesterRegistration.academicSemester.isCurrent) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Semester is already started!');
  }

  await prisma.$transaction(async prismaTransactionClient => {
    await prismaTransactionClient.academicSemester.updateMany({
      where: {
        isCurrent: true,
      },
      data: {
        isCurrent: false,
      },
    });

    await prismaTransactionClient.academicSemester.update({
      where: {
        id: semesterRegistration.academicSemesterId,
      },
      data: {
        isCurrent: true,
      },
    });

    const studentSemesterRegistrations =
      await prisma.studentSemesterRegistration.findMany({
        where: {
          semesterRegistration: {
            id,
          },
          isConfirmed: true,
        },
      });

    await asyncForEach(
      studentSemesterRegistrations,
      async (studentSemReg: StudentSemesterRegistration) => {
        if (studentSemReg.totalCreditsTaken) {
          const totalSemesterPaymentAmount =
            studentSemReg.totalCreditsTaken * 5000;

          await StudentSemesterPaymentService.createSemesterPayment(
            prismaTransactionClient,
            {
              studentId: studentSemReg.studentId,
              academicSemesterId: semesterRegistration.academicSemesterId,
              totalPaymentAmount: totalSemesterPaymentAmount,
            }
          );
        }
        const studentSemesterRegistrationCourses =
          await prismaTransactionClient.studentSemesterRegistrationCourse.findMany(
            {
              where: {
                semesterRegistration: {
                  id,
                },
                student: {
                  id: studentSemReg.studentId,
                },
              },
              include: {
                offeredCourse: {
                  include: {
                    course: true,
                  },
                },
              },
            }
          );
        await asyncForEach(
          studentSemesterRegistrationCourses,
          async (
            item: StudentSemesterRegistrationCourse & {
              offeredCourse: OfferedCourse & {
                course: Course;
              };
            }
          ) => {
            const isExistEnrolledData =
              await prismaTransactionClient.studentEnrolledCourse.findFirst({
                where: {
                  student: { id: item.studentId },
                  course: { id: item.offeredCourse.courseId },
                  academicSemester: {
                    id: semesterRegistration.academicSemesterId,
                  },
                },
              });

            if (!isExistEnrolledData) {
              const enrolledCourseData = {
                studentId: item.studentId,
                courseId: item.offeredCourse.courseId,
                academicSemesterId: semesterRegistration.academicSemesterId,
              };

              const studentEnrolledCourseData =
                await prismaTransactionClient.studentEnrolledCourse.create({
                  data: enrolledCourseData,
                });

              await StudentEnrolledCourseMarkService.createStudentEnrolledCourseDefaultMark(
                prismaTransactionClient,
                {
                  studentId: item.studentId,
                  studentEnrolledCourseId: studentEnrolledCourseData.id,
                  academicSemesterId: semesterRegistration.academicSemesterId,
                }
              );
            }
          }
        );
      }
    );
  });

  return {
    message: 'Semester started successfully!',
  };
};

const getMySemesterRegCourses = async (authUserId: string) => {
  // console.log('Semester Registration', authUserId);
  const student = await prisma.student.findFirst({
    where: {
      studentId: authUserId,
    },
  });
  // console.log(student);
  const semesterRegistration = await prisma.semesterRegistration.findFirst({
    where: {
      status: {
        in: [
          SemesterRegistrationStatus.UPCOMING,
          SemesterRegistrationStatus.ONGOING,
        ],
      },
    },
    include: {
      academicSemester: true,
    },
  });
  // console.log(semesterRegistration);
  if (!semesterRegistration) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'No Semester Registration Not Found'
    );
  }
  const studentCompletedCourse = await prisma.studentEnrolledCourse.findMany({
    where: {
      status: StudentEnrolledCourseStatus.COMPLETED,
      student: {
        id: student?.id,
      },
    },
    include: {
      course: true,
    },
  });
  // console.log(studentCompletedCourse);
  const studentCurrentSemesterTakenCourse =
    await prisma.studentSemesterRegistrationCourse.findMany({
      where: {
        student: {
          id: student?.id,
        },
        semesterRegistration: {
          id: semesterRegistration?.id,
        },
      },
      include: {
        offeredCourse: true,
        offeredCourseSection: true,
      },
    });
  // console.log(
  //   'student Current Semester Taken Course',
  //   studentCurrentSemesterTakenCourse
  // );

  const offeredCourse = await prisma.offeredCourse.findMany({
    where: {
      semesterRegistration: {
        id: semesterRegistration?.id,
      },
      academicDepartment: {
        id: student?.academicDepartmentId,
      },
    },
    include: {
      course: {
        include: {
          preRequisite: {
            include: {
              preRequisite: true,
            },
          },
        },
      },
      offeredCourseSections: {
        include: {
          offeredCourseClassSchedules: {
            include: {
              room: {
                include: {
                  building: true,
                },
              },
            },
          },
        },
      },
    },
  });
  // console.log(offeredCourse);
  const availableCourses = SemesterRegistrationUtils.getAvailableCourses(
    offeredCourse,
    studentCompletedCourse,
    studentCurrentSemesterTakenCourse
  );
  return availableCourses;
};

export const SemesterRegistrationService = {
  insertIntoDB,
  getIdFromDB,
  updateOneFromDB,
  deleteIdFromDB,
  getAllFromDB,
  startMyRegistration,
  enrollIntoCourse,
  withdrawFromCourse,
  confirmMyRegistration,
  getMyRegistration,
  startNewSemester,
  getMySemesterRegCourses,
};
