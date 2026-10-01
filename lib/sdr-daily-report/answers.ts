import {
    DAILY_REPORT_QUESTIONS,
    REACHABILITY_EXCLUSIVE,
    type DailyReportQuestionKey,
} from "./options";

/** What the SDR has ticked so far in the form. */
export interface DailyReportAnswers {
    reachability: string[];
    prospectReturns: string[];
    pitchFeeling: string[];
    mainBlocker: string | null;
    fieldComment: string;
    missionIds: string[];
}

export function emptyAnswers(missionIds: string[] = []): DailyReportAnswers {
    return {
        reachability: [],
        prospectReturns: [],
        pitchFeeling: [],
        mainBlocker: null,
        fieldComment: "",
        missionIds,
    };
}

/**
 * Tick or untick one option. Multi-choice questions toggle; the main blocker is
 * a radio (choosing replaces). "Bonne joignabilité globale" and the
 * reachability difficulties push each other out, since they contradict.
 */
export function toggleAnswer(
    answers: DailyReportAnswers,
    key: DailyReportQuestionKey,
    value: string,
): DailyReportAnswers {
    if (key === "mainBlocker") return { ...answers, mainBlocker: value };

    const current = answers[key];
    if (current.includes(value)) {
        return { ...answers, [key]: current.filter((v) => v !== value) };
    }
    if (key === "reachability") {
        return {
            ...answers,
            reachability:
                value === REACHABILITY_EXCLUSIVE
                    ? [value]
                    : [...current.filter((v) => v !== REACHABILITY_EXCLUSIVE), value],
        };
    }
    return { ...answers, [key]: [...current, value] };
}

export function isQuestionAnswered(answers: DailyReportAnswers, key: DailyReportQuestionKey): boolean {
    return key === "mainBlocker" ? answers.mainBlocker !== null : answers[key].length > 0;
}

/** Every question answered — the comment is the only optional part. */
export function countAnswered(answers: DailyReportAnswers): { answered: number; total: number } {
    return {
        answered: DAILY_REPORT_QUESTIONS.filter((q) => isQuestionAnswered(answers, q.key)).length,
        total: DAILY_REPORT_QUESTIONS.length,
    };
}
