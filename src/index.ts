import {
  $query,
  $update,
  Record,
  StableBTreeMap,
  Vec,
  match,
  Result,
  nat64,
  ic,
  Opt,
} from "azle";
import { v4 as uuidv4 } from "uuid";

type Job = Record<{
  id: string;
  publisher: string;
  applicants: Vec<Applicant>;
  position: string;
  email: string;
  skill: string;
  companyName: string;
  companyUrl: string;
  description: string;
  salary: string;
  location: string;
  createdAt: nat64;
  updatedAt: Opt<nat64>;
}>;

type JobPayload = Record<{
  position: string;
  email: string;
}>;

type Applicant = Record<{
  owner: string;
  name: string;
  email: string;
  applyAt: nat64;
}>;

type ApplicantPayload = Record<{
  name: string;
  email: string;
}>;

const jobStorage = new StableBTreeMap<string, Job>(0, 44, 1024);

//  Get all jobs

$query;
export function getTotalJobs(): Result<Vec<Job>, string> {
  try {
    return Result.Ok(jobStorage.values());
  } catch (error) {
    return Result.Err(`Error accessing jobStorage: ${error}`);
  }
}

//   Get all jobs published by the caller

$query;
export function getMyPublishJobs(): Result<Vec<Job>, string> {
  try {
    // Consider adding error handling to catch any potential errors that may occur during the execution of the function.
    const myJobs = jobStorage
      .values()
      .filter((job) => job.publisher === ic.caller().toString());
    return Result.Ok<Vec<Job>, string>(myJobs);
  } catch (error) {
    return Result.Err<Vec<Job>, string>(`Error occurred: ${error}`);
  }
}

//   Get all jobs applied by the caller

$query;
export function getMyApplyJobs(): Result<Vec<Job>, string> {
  try {
    // Get all jobs from jobStorage and filter them to find jobs where the caller is listed as an applicant

    const myJobs = jobStorage.values().filter((job) => {
      const applicants = job.applicants || [];
      const isApplied = applicants.some(
        (applicant) => applicant.owner === ic.caller().toString()
      );
      return isApplied;
    });
    // Return the filtered list of jobs wrapped in a Result object with success status

    return Result.Ok<Vec<Job>, string>(myJobs);
  } catch (error) {
    // In case of any error during the process, return a Result object with error status

    return Result.Err<Vec<Job>, string>(`Error in getMyApplyJobs: ${error}`);
  }
}

//  Search jobs by keyword

$query;
export function searchJobs(keyword: string): Result<Vec<Job>, string> {
  try {
    // Get all jobs from jobStorage and filter them to find jobs matching the keyword

    const myJobs = jobStorage.values().filter((job) => {
      // Perform case-insensitive search for the keyword in various job fields

      const isMatched =
        job.position.toLowerCase().includes(keyword.toLowerCase()) ||
        job.skill.toLowerCase().includes(keyword.toLowerCase()) ||
        job.companyName.toLowerCase().includes(keyword.toLowerCase()) ||
        job.location.toLowerCase().includes(keyword.toLowerCase()) ||
        job.description.toLowerCase().includes(keyword.toLowerCase());
      return isMatched;
    });
    // Return the filtered list of matching jobs wrapped in a Result object with success status

    return Result.Ok<Vec<Job>, string>(myJobs);
  } catch (error) {
    // In case of any error during the filtering process, return a Result object with error status

    return Result.Err<Vec<Job>, string>("Error filtering jobs: " + error);
  }
}

//  get a job by id

$query;
export function getJob(id: string): Result<Job, string> {
  return match(jobStorage.get(id), {
    // If the job with the provided ID exists in the jobStorage, return it wrapped in a Result object with success status

    Some: (job) => Result.Ok<Job, string>(job),
    // If the job with the provided ID does not exist in the jobStorage, return an error message wrapped in a Result object with error status

    None: () =>
      Result.Err<Job, string>(
        `The Job with id=${id} not found in the jobStorage`
      ),
  });
}

//  apply a job

$update;
export function applyJob(
  id: string,
  applicantPayload: ApplicantPayload
): Result<Job, string> {
  return match(jobStorage.get(id), {
    Some: (job) => {
      const applicants = job.applicants || [];

      // check if the caller has already applied the job
      if (applicants.length > 0) {
        const isApplied =
          applicants.findIndex(
            (applicant) => applicant.owner.toString() === ic.caller().toString()
          ) > -1;
        if (isApplied) {
          // If the caller has already applied for the job, return an error message wrapped in a Result object with error status

          return Result.Err<Job, string>(
            `You have already applied the job with id=${id}.`
          );
        }
      }
      // Create an applicant object with the caller's details and the provided applicantPayload

      const applicant: Applicant = {
        owner: ic.caller().toString(),
        name: applicantPayload.name,
        email: applicantPayload.email,
        applyAt: ic.time(),
      };
      // Add the new applicant to the job's applicant list

      applicants.push(applicant);
      // Create an updatedJob object with the updated applicant list and updated updatedAt timestamp

      const updatedJob: Job = {
        ...job,
        applicants,
        updatedAt: Opt.Some(ic.time()),
      };
      // Store the updated job back in the jobStorage using the same ID

      jobStorage.insert(job.id, updatedJob);
      // Return the updatedJob wrapped in a Result object with success status

      return Result.Ok<Job, string>(updatedJob);
    },
    // If the job with the provided ID does not exist in the jobStorage, return an error message wrapped in a Result object with error status

    None: () =>
      Result.Err<Job, string>(
        `couldn't apply the job with id=${id}. Job not found`
      ),
  });
}

//   cancel applied job

$update;
export function cancelAppliedJob(id: string): Result<Job, string> {
  return match(jobStorage.get(id), {
    Some: (job) => {
      const applicants = job.applicants || [];
      // check if the caller has already applied the job
      if (applicants.length === 0) {
        // If the caller has not applied for the job, return an error message wrapped in a Result object with error status
        return Result.Err<Job, string>(
          `You have not applied the job with id=${id}.`
        );
      } else {
        const isApplied = applicants.some(
          (applicant) => applicant.owner.toString() === ic.caller().toString()
        );
        if (!isApplied) {
          return Result.Err<Job, string>(
            `You have not applied the job with id=${id}.`
          );
        }
      }
      // Create an updatedApplicants array with the caller's details removed from the applicant list
      const updatedApplicants = applicants.filter(
        (applicant) => applicant.owner.toString() !== ic.caller().toString()
      );
      // Create an updatedJob object with the updated applicant list and updated updatedAt timestamp
      const updatedJob: Job = {
        ...job,
        applicants: updatedApplicants,
        updatedAt: Opt.Some(ic.time()),
      };
      // Store the updated job back in the jobStorage using the same ID
      jobStorage.insert(job.id, updatedJob);
      // Return the updatedJob wrapped in a Result object with success status

      return Result.Ok<Job, string>(updatedJob);
    },
    // If the job with the provided ID does not exist in the jobStorage, return an error message wrapped in a Result object with error status
    None: () =>
      Result.Err<Job, string>(
        `couldn't apply the job with id=${id}. Job not found`
      ),
  });
}

//   publishJob a new job

$update;
export function publishJob(payload: JobPayload): Result<Job, string> {
  // Create a new job object using the provided payload
  const job: Job = createJob(payload);
  // Insert the newly created job into the jobStorage using its ID as the key
  jobStorage.insert(job.id, job);
  // Return the newly created job wrapped in a Result object with success status
  return Result.Ok(job);
}

function createJob(payload: JobPayload): Job {
  return {
    id: uuidv4(),
    position: payload.position,
    email: payload.email,
    skill: "",
    publisher: ic.caller().toString(),
    applicants: [],
    companyName: "",
    companyUrl: "",
    description: "",
    salary: "",
    location: "",
    createdAt: ic.time(),
    updatedAt: Opt.None,
  };
}

//   update the info of published job

$update;
export function updateJob(
  id: string,
  payload: JobPayload
): Result<Job, string> {
  return match(jobStorage.get(id), {
    Some: (job) => {
      // check if the caller is the publisher of the job
      if (job.publisher.toString() !== ic.caller().toString()) {
        // If the caller is not the publisher of the job, return an error message wrapped in a Result object with error status
        return Result.Err<Job, string>(
          `You are not the publisher of the job with id=${id}.`
        );
      }
      // Create an updatedJob object with the current job details merged with the provided payload and updated updatedAt timestamp
      const updatedJob: Job = {
        ...job,
        ...payload,
        updatedAt: Opt.Some(ic.time()),
      };
      // Store the updated job back in the jobStorage using the same ID
      jobStorage.insert(job.id, updatedJob);
      // Return the updatedJob wrapped in a Result object with success status
      return Result.Ok<Job, string>(updatedJob);
    },
    // If the job with the provided ID does not exist in the jobStorage, return an error message wrapped in a Result object with error status
    None: () =>
      Result.Err<Job, string>(
        `couldn't update the job with id=${id}. Job not found`
      ),
  });
}

//  delete the published job

$update;
export function deleteJob(id: string): Result<Job, string> {
  return match(jobStorage.remove(id), {
    Some: (deletedJob) => {
      // check if the caller is the publisher of the job
      if (deletedJob.publisher.toString() !== ic.caller().toString()) {
        return Result.Err<Job, string>(
          `Only the publisher of the job with id=${id} can delete it.`
        );
      }
      // log the deletion operation
      console.log(
        `Job with id=${id} has been deleted by ${ic.caller().toString()}`
      );
      return Result.Ok<Job, string>(deletedJob);
    },
    None: () =>
      Result.Err<Job, string>(
        `couldn't delete the job with id=${id}. Job not found.`
      ),
  });
}

globalThis.crypto = {
  //@ts-ignore
  getRandomValues: () => {
    let array = new Uint8Array(32);

    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }

    return array;
  },
};
