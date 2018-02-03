var gulp = require("gulp");
var browserify = require("browserify");
var source = require('vinyl-source-stream');
var tsify = require("tsify");
var uglify = require('gulp-uglify');
var sourcemaps = require('gulp-sourcemaps');
var buffer = require('vinyl-buffer');
var typescript = require('gulp-typescript');
var merge = require('merge2');  
var tsProject = typescript.createProject('tsconfig.json');

var paths = {
    pages: ['src/*.html'],
    typescript:  ['src/*.ts']
};

gulp.task("copy-html", function () {
    return gulp.src(paths.pages)
        .pipe(gulp.dest("dist"));
});

// ...
gulp.task('scripts', function() {  
    var tsResult = tsProject.src()
        .pipe(tsProject());
    return merge([
        tsResult.js.pipe(gulp.dest('release')),
        tsResult.dts.pipe(gulp.dest('release'))
    ]);
});

gulp.task("default", ["copy-html", "scripts"], function () {
    var project = typescript.createProject('tsconfig.json', {declaration: true});

    
    return browserify({
        basedir: '.',
        debug: true,
        entries: ['src/main.ts'],
        cache: {},
        packageCache: {}
    })
    .plugin(tsify)
    .bundle()
    .pipe(source('bundle.js'))
    .pipe(buffer())
    .pipe(sourcemaps.init({loadMaps: true}))
    .pipe(uglify())
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest("dist"));
});