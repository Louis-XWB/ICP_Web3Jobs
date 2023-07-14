import { $query, $update, Record, StableBTreeMap, Vec, match, Result, nat64, ic, Opt } from 'azle';
import { v4 as uuidv4 } from 'uuid';

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
}>

type JobPayload = Record<{
    position: string;
    email: string;
}>

type Applicant = Record<{
    owner: string;
    name: string;
    email: string;
    applyAt: nat64;
}>

type ApplicantPayload = Record<{
    name: string;
    email: string;
}>

const jobStorage = new StableBTreeMap<string, Job>(0, 44, 1024);


/**
 * Get all jobs
 */
$query;
export function getTotalJobs(): Result<Vec<Job>, string> {
    return Result.Ok(jobStorage.values());
}

/**
 * Get all jobs published by the caller
 */
$query;
export function getMyPublishJobs(): Result<Vec<Job>, string> {
    const myJobs = jobStorage.values().filter((job) => job.publisher === ic.caller().toString());
    return Result.Ok<Vec<Job>, string>(myJobs);
}

/**
 * Get all jobs applied by the caller
 */
$query;
export function getMyApplyJobs(): Result<Vec<Job>, string> {
    const myJobs = jobStorage.values().filter((job) => {
        const applicants = job.applicants || [];
        const isApplied = applicants.some((applicant) => applicant.owner === ic.caller().toString());
        return isApplied;
    });
    return Result.Ok<Vec<Job>, string>(myJobs);
}

/**
 * Search jobs by keyword
 */
$query;
export function searchJobs(keyword: string): Result<Vec<Job>, string> {
    const myJobs = jobStorage.values().filter((job) => {
        // search keyword in job's fields
        const isMatched = job.position.includes(keyword)
            || job.skill.includes(keyword)
            || job.companyName.includes(keyword)
            || job.location.includes(keyword)
            || job.description.includes(keyword);
        return isMatched;
    });
    return Result.Ok<Vec<Job>, string>(myJobs);
}


/**
 * get a job by id
 */
$query;
export function getJob(id: string): Result<Job, string> {
    return match(jobStorage.get(id), {
        Some: (job) => Result.Ok<Job, string>(job),
        None: () => Result.Err<Job, string>(`The Job with id=${id} not found`)
    });
}

/**
 * apply a job 
*/
$update;
export function applyJob(id: string, applicantPayload: ApplicantPayload): Result<Job, string> {
    return match(jobStorage.get(id), {
        Some: (job) => {
            const applicants = job.applicants || [];

            // check if the caller has already applied the job
            if (applicants.length > 0) {
                const isApplied = applicants.findIndex((applicant) => applicant.owner.toString() === ic.caller().toString())>-1;
                if (isApplied) {
                    return Result.Err<Job, string>(`You have already applied the job with id=${id}.`);
                }
            }

            const applicant: Applicant = {
                owner: ic.caller().toString(),
                name: applicantPayload.name,
                email: applicantPayload.email,
                applyAt: ic.time()
            };
            applicants.push(applicant);

            const updatedJob: Job = { ...job, applicants, updatedAt: Opt.Some(ic.time()) };
            jobStorage.insert(job.id, updatedJob);
            return Result.Ok<Job, string>(updatedJob);
        },
        None: () => Result.Err<Job, string>(`couldn't apply the job with id=${id}. Job not found`)
    });
}

/**
 * cancel applied job
 */
$update;
export function cancelAppliedJob(id: string): Result<Job, string> {
    return match(jobStorage.get(id), {
        Some: (job) => {
            const applicants = job.applicants || [];
            // check if the caller has already applied the job
            if (applicants.length === 0) {
                return Result.Err<Job, string>(`You have not applied the job with id=${id}.`);
            } else {
                const isApplied = applicants.some((applicant) => applicant.owner.toString() === ic.caller().toString());
                if (!isApplied) {
                    return Result.Err<Job, string>(`You have not applied the job with id=${id}.`);
                }
            }

            const updatedApplicants = applicants.filter((applicant) => applicant.owner.toString() !== ic.caller().toString());
            const updatedJob: Job = { ...job, applicants: updatedApplicants, updatedAt: Opt.Some(ic.time()) };
            jobStorage.insert(job.id, updatedJob);
            return Result.Ok<Job, string>(updatedJob);
        },
        None: () => Result.Err<Job, string>(`couldn't apply the job with id=${id}. Job not found`)
    });
}

/**
 * publishJob a new job
 */
$update;
export function publishJob(payload: JobPayload): Result<Job, string> {
    const job: Job = {
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
        updatedAt: Opt.None
    };
    jobStorage.insert(job.id, job);
    return Result.Ok(job);
}

/**
 * update the info of published job
 */
$update;
export function updateJob(id: string, payload: JobPayload): Result<Job, string> {
    return match(jobStorage.get(id), {
        Some: (job) => {
            // check if the caller is the publisher of the job
            if (job.publisher.toString() !== ic.caller().toString()) {
                return Result.Err<Job, string>(`You are not the publisher of the job with id=${id}.`);
            }
            const updatedJob: Job = { ...job, ...payload, updatedAt: Opt.Some(ic.time()) };
            jobStorage.insert(job.id, updatedJob);
            return Result.Ok<Job, string>(updatedJob);
        },
        None: () => Result.Err<Job, string>(`couldn't update the job with id=${id}. Job not found`)
    });
}

/**
 * delete the published job
 */ 
$update;
export function deleteJob(id: string): Result<Job, string> {
    return match(jobStorage.remove(id), {
        Some: (deletedJob) => {
            // check if the caller is the publisher of the job
            if (deletedJob.publisher.toString() !== ic.caller().toString()) {
                return Result.Err<Job, string>(`You are not the publisher of the job with id=${id}.`);
            }
            return Result.Ok<Job, string>(deletedJob)
        },
        None: () => Result.Err<Job, string>(`couldn't delete the job with id=${id}. Job not found.`)
    });
}

// a workaround to make uuid package work with Azle
globalThis.crypto = {
    getRandomValues: () => {
        let array = new Uint8Array(32)

        for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256)
        }

        return array
    }
}