export const DEFAULT_GRADE_SCALE = [
    { min: 90, grade: 'O', points: 10 },
    { min: 80, grade: 'A+', points: 9 },
    { min: 70, grade: 'A', points: 8 },
    { min: 60, grade: 'B+', points: 7 },
    { min: 50, grade: 'B', points: 6 },
    { min: 45, grade: 'C', points: 5 },
    { min: 40, grade: 'P', points: 4 },
    { min: 0, grade: 'F', points: 0 },
];
export function gradeFor(percentage, scale = DEFAULT_GRADE_SCALE) {
    const sorted = [...scale].sort((a, b) => b.min - a.min);
    return sorted.find((b) => percentage >= b.min) ?? sorted[sorted.length - 1];
}
//# sourceMappingURL=grades.js.map