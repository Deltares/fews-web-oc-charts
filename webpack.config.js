import * as path from "path"
import CopyPlugin from "copy-webpack-plugin"
import TerserPlugin from "terser-webpack-plugin"

module.exports = {
  mode: 'development',
  entry: './lib/esm/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    library: 'wbCharts',
    libraryTarget: 'umd',
    filename: 'wb-charts.umd.js',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json'],
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          keep_classnames: true,
        },
      }),
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'src/*.css', to: "[name][ext]", },
      ],
    }),
  ],
  module: {
    // rules: [
    //   {
    //     // Include ts, tsx, and js files.
    //     test: /\.(tsx?)|(js)$/,
    //     exclude: /node_modules/,
    //     loader: 'ts-loader',
    //   },
    // ],
  },
  devtool: 'source-map',
  externals: ['d3']
}
