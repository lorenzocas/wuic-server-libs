import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { Stimulsoft } from 'stimulsoft-reports-js/Scripts/stimulsoft.reports';

Stimulsoft.Base.StiLicense.Key = "6vJhGtLLLz2GNviWmUTrhSqnOItdDwjBylQzQcAOiHmJwbRgcBvPtpBV1fMGaPPIs2/9guB9QicH0Bjvx9nHoRyBgV" +
  "QOa5IHvhbUfunVFmPp3hn4ueHLQzwLc6x8JZ7V0LhGJoCxpDgYf2YZypPBHq8dylG5MmTtHomm+ukurtQrsjcNEHYh" +
  "J91UI/dS3h+iXj/TDnDMHgUNjcML2UI0ptP2h5MnbwbgRa2DOrG8pKMwr4MH7tzNeMxjcu659zBm4iRJWwb07txa4P" +
  "N0E26LrfMySzAaoMUPme6khincTraRCPDvjRU98485MFN2vZ8SscUGJq3Zz7hJxl/G6zYCJe6HyE7bxQIA7oHBzgI3" +
  "TvxeNrt5Zj/AyNnJNwi1qCmKN8wCBSCxYYKDhBmjzR3E88VWS8xEDkebwodLO7ygOkEA/xIoelbxoIqkNGDUPjIOWI" +
  "4UGsdVJwepeDEnfPA6GwsjHbtqiL6ViBc9VUo39CA8ITJudNuDjIzNFudMSZKmh2A0ZGxgp2wvnYmQGWE3MRnskjxT" +
  "vxM48Z8B/cYiPiaGpiePlIvvNyHsDCt87dCC";

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));

