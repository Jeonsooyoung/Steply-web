import { trendSeries } from './reportData';

export function TrendChart() {
  const { weeks, chairStandReps, tandemHoldSeconds } = trendSeries;

  return (
    <div className="ref-trend-chart" aria-label="Balance and strength trends for four weeks">
      <div className="ref-trend-chart__legend">
        <span><i className="green" />Chair Stand Reps (reps)</span>
        <span><i className="amber" />Tandem Hold (sec)</span>
      </div>
      <div className="ref-trend-chart__plot">
        {weeks.map((week, index) => (
          <div className="ref-trend-chart__column" key={week}>
            <div className="ref-trend-chart__dots">
              <span className="amber" style={{ bottom: `${tandemHoldSeconds[index] * 2.1}%` }}><b>{tandemHoldSeconds[index]} sec</b></span>
              <span className="green" style={{ bottom: `${chairStandReps[index] * 3.2}%` }}><b>{chairStandReps[index]}</b></span>
            </div>
            <small>{week}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
