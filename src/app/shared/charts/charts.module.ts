import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BarListComponent } from './bar-list.component';
import { SplitBarComponent } from './split-bar.component';
import { TrendChartComponent } from './trend-chart.component';

/**
 * The app's chart set — ranked bars, part-to-whole split bar, and a trend line
 * against the previous period. Shared by the Van Sales reports and every module
 * dashboard, so a chart reads the same wherever it appears.
 */
@NgModule({
  imports: [CommonModule],
  declarations: [BarListComponent, SplitBarComponent, TrendChartComponent],
  exports: [BarListComponent, SplitBarComponent, TrendChartComponent],
})
export class ChartsModule {}
