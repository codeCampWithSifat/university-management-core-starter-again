/* eslint-disable @typescript-eslint/no-explicit-any */
import prisma from '../../../shared/prisma';

const insertIntoDB = async (data: any): Promise<any> => {
  const { preRequisiteCourses, ...courseData } = data;
  //   console.log(preRequisiteCourses);
  const newCourse = await prisma.$transaction(async transactionClient => {
    const result = await transactionClient.course.create({
      data: courseData,
    });

    if (preRequisiteCourses && preRequisiteCourses.length > 0) {
      for (let index = 0; index < preRequisiteCourses.length; index++) {
        const createPrerequisite =
          await transactionClient.courseToPrequisite.create({
            data: {
              courseId: result.id,
              preRequisiteId: preRequisiteCourses[index].courseId,
            },
          });
        console.log(createPrerequisite);
      }
    }
    return result;
  });

  if (newCourse) {
    const responseData = await prisma.course.find;
  }
};

export const CourseService = {
  insertIntoDB,
};
