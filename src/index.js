'use strict';

var uploaderApp = angular.module('of.uploader', [])

uploaderApp.factory('ofUploader', ['$q', '$rootScope', function ($q, $rootScope) {

	function uploadFile(fileElementId, uploadUrl, contentType, progress) {
		return $q(function (resolve, reject) {

			//validate input
			if (!fileElementId) return reject("Invalid file element ID");
			if (!uploadUrl) return reject("Invalid upload URL");
			if (!contentType) return reject("Invalid content type");
			if (progress == undefined) progress = 0;

			var fileEl = angular.element(document.querySelector("#"+fileElementId));
			if (!fileEl) return reject("Invalid file element");

			var uploadFile = fileEl[0].files[0];
			if (!uploadFile) return reject("No File Selected");

			//create a request
			var xhr = createCORSRequest(uploadUrl);
			// progress = 0;

			//complete the loading
			xhr.onload = function () {
				if (xhr.status == 200) {
					progress = 100;
					resolve();
				} else {
					progress = 0;
				}
				emitProgress();
			};

			//deal with errors
			xhr.onerror = function (err) {
				progress = 0;
				emitProgress();
				reject("Error Uploading File");
			};

			//on progress upload
			xhr.upload.onprogress = function (e) {
				if (e.lengthComputable) {
					var percentLoaded = Math.round((e.loaded / e.total) * 100);
					progress = percentLoaded;
					emitProgress();
				}
			};

			function emitProgress() {
				$rootScope.$broadcast(fileElementId+"-progress", progress);
			}

			//set content type
			xhr.setRequestHeader('Content-Type', contentType);

			//start the upload
			xhr.send(uploadFile);

		});
	}

	//create a browser compatible CORS upload request
	function createCORSRequest(url) {
		var method = 'PUT';
		var xhr = new XMLHttpRequest();
		if ("withCredentials" in xhr) {
			xhr.open(method, url, true);
		} else if (typeof XDomainRequest != "undefined") {
			xhr = new XDomainRequest();
			xhr.open(method, url);
		} else {
			xhr = null;
		}
		return xhr;
	}

	return {
		uploadFile: uploadFile
	};

}]);
