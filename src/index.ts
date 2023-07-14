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

/**
 * Get all jobs
 */
$query
export function getTotalJobs(): Result<Vec<Job>, string> {
    return Result.Ok(jobStorage.values());
}

/**
 * Get all jobs published by the caller
 */
$query
export function getMyPublishJobs(): Result<Vec<Job>, string> {
    const myJobs = jobStorage.values().filter((job) => job.publisher === ic.caller().toString());
    return Result.Ok<Vec<Job>, string>(myJobs);
}

/**
 * Get all jobs applied by the caller
 */
$query
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
$query
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
 * Get applicants for a job
 */
$query
export function getApplicantsForJob(id: string): Result<Vec<Applicant>, string> {
    return match(jobStorage.get(id), {
        Some: (job) => Result.Ok<Vec<Applicant>, string>(job.applicants || []),
        None: () => Result.Err<Vec<Applicant>, string>(`The Job with id=${id} not found`)
    });
}

/**
 * Get a specific applicant's details
 */
$query
export function getApplicant(id: string): Result<Applicant, string> {
    const allJobs = jobStorage.values();
    for (const job of allJobs) {
        const applicants = job.applicants || [];
        const applicant = applicants.find((applicant) => applicant.owner === id);
        if (applicant) {
            return Result.Ok<Applicant, string>(applicant);
        }
    }
    return Result.Err<Applicant, string>(`Applicant with id=${id} not found`);
}

// Rest of the code...
