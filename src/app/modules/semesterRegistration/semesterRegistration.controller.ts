import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync';
import pick from '../../../shared/pick';
import sendResponse from '../../../shared/sendResponse';
import { semesterRegistrationFilterableFields } from './semesterRegistration.constants';
import { SemesterRegistrationService } from './semesterRegistration.service';

const insertIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await SemesterRegistrationService.insertIntoDB(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Semester Registration Created Successfully',
    data: result,
  });
});

const getAllFromDB = catchAsync(async (req: Request, res: Response) => {
  const filters = pick(req.query, semesterRegistrationFilterableFields);
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const result = await SemesterRegistrationService.getAllFromDB(
    filters,
    options
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'SemesterRegistrations fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});

const getIdFromDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const result = await SemesterRegistrationService.getIdFromDB(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Single Semester Registration Fetched Successfully',
    data: result,
  });
});

const updateOneFromDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const result = await SemesterRegistrationService.updateOneFromDB(
    id,
    req.body
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Update Semester Registration  Successfully',
    data: result,
  });
});

const deleteIdFromDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const result = await SemesterRegistrationService.deleteIdFromDB(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Delete Semester Registration  Successfully',
    data: result,
  });
});

export const SemesterRegistrationController = {
  insertIntoDB,
  getIdFromDB,
  updateOneFromDB,
  deleteIdFromDB,
  getAllFromDB,
};
