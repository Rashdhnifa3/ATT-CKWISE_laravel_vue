import { Component, OnInit, ViewEncapsulation, Input } from '@angular/core';
import { Technique, Tactic } from '../../classes/stix';
import { MatrixCommon } from '../matrix-common';
import { ConfigService } from '../../services/config.service';
import { ViewModelsService } from '../../services/viewmodels.service';
import { NgFor, NgStyle, NgIf, NgClass } from '@angular/common';
import { TacticCellComponent } from '../tactic-cell/tactic-cell.component';
import { TechniqueCellComponent } from '../technique-cell/technique-cell.component';

@Component({
    selector: 'matrix-flat',
    templateUrl: './matrix-flat.component.html',
    styleUrls: ['./matrix-flat.component.scss'],
    encapsulation: ViewEncapsulation.None,
    imports: [NgFor, NgStyle, TacticCellComponent, NgIf, TechniqueCellComponent, NgClass],
})
export class MatrixFlatComponent extends MatrixCommon implements OnInit {
    @Input() planning = false;

    public togglePlanTechnique(technique: Technique, tactic: Tactic): void {
        this.viewModel.planningContext = { technique, tactic };
        // Each row is independent, including parents and children; preserve cross-tactic identity.
        this.viewModel.selectSubtechniquesWithParent = false;
        if (this.viewModel.isTechniqueSelected(technique, tactic)) this.viewModel.unselectTechnique(technique, tactic);
        else this.viewModel.selectTechnique(technique, tactic);
        this.viewModelsService.onSelectionChange.emit();
    }

    public planningTechniques(techniques: Technique[], tactic: Tactic): Technique[] {
        // Preserve the complete current ATT&CK hierarchy regardless of imported layer filters.
        return this.viewModel.sortTechniques(
            techniques.filter((technique) => !technique.revoked && !technique.deprecated && technique.tactics.includes(tactic.shortname)),
            tactic
        );
    }

    constructor(configService: ConfigService, viewModelsService: ViewModelsService) {
        super(configService, viewModelsService);
    }

    ngOnInit(): void {
        // intentionally left blank
    }
}
