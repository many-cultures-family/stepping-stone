// 재분석 횟수 한도. 서버가 draft 응답에 reanalysis_limit 을 주면 그 값을 쓴다.
// 아직 응답에 없어서(백엔드 MAX_REANALYSIS_COUNT = 3, DATA-MODEL reanalysis_count "3회까지") 그때만 3으로 대신한다.
// 백엔드가 응답에 넣으면 아래 기본값도 지운다.
const DEFAULT_REANALYSIS_LIMIT = 3

/** 이 작성 건의 재분석 한도 */
export function reanalysisLimitOf(draft) {
  const limit = draft?.reanalysis_limit
  return Number.isInteger(limit) && limit >= 0 ? limit : DEFAULT_REANALYSIS_LIMIT
}
